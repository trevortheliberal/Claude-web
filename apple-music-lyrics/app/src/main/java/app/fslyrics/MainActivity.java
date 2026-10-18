package app.fslyrics;

import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Outline;
import android.graphics.RenderEffect;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Choreographer;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewOutlineProvider;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.view.animation.LinearInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity implements LyricsView.Listener, Choreographer.FrameCallback {
    private static final String APPLE_MUSIC = "com.apple.android.music";
    private static final long CONTROLS_HIDE_MS = 4000;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    private ComponentName listenerComponent;
    private MediaSessionManager sessionManager;
    private LyricsRepository repo;
    private MediaController controller;

    private String trackKey;
    private Runnable pendingFetch;
    private Bitmap shownArt;

    // Our own playback clock, so a tap-to-seek moves the lyrics immediately.
    private long basePosition;
    private long baseTime;
    private float speed;
    private boolean playing;
    private boolean frameLoopRunning;

    private ImageView background;
    private ImageView headerArt;
    private TextView titleView, artistView, sourceView;
    private LyricsView lyricsView;
    private LinearLayout controls;
    private ControlButton playButton;
    private View permissionPanel;
    private ObjectAnimator bgSpin;

    private final Runnable hideControls = () -> setControlsVisible(false);

    private final MediaSessionManager.OnActiveSessionsChangedListener sessionsListener = this::pickController;

    private final MediaController.Callback controllerCallback = new MediaController.Callback() {
        @Override
        public void onMetadataChanged(MediaMetadata metadata) {
            onMetadata(metadata);
        }

        @Override
        public void onPlaybackStateChanged(PlaybackState state) {
            onState(state);
        }

        @Override
        public void onSessionDestroyed() {
            refreshSessions();
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        listenerComponent = new ComponentName(this, MediaListener.class);
        sessionManager = getSystemService(MediaSessionManager.class);
        repo = new LyricsRepository(this);
        setContentView(buildUi());
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemBars();
        bgSpin.start();
        if (hasListenerAccess()) {
            permissionPanel.setVisibility(View.GONE);
            connect();
        } else {
            permissionPanel.setVisibility(View.VISIBLE);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        bgSpin.pause();
        disconnect();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        io.shutdownNow();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    // ------------------------------------------------------------ sessions

    private boolean hasListenerAccess() {
        return getSystemService(NotificationManager.class).isNotificationListenerAccessGranted(listenerComponent);
    }

    private void connect() {
        try {
            sessionManager.addOnActiveSessionsChangedListener(sessionsListener, listenerComponent, main);
            refreshSessions();
        } catch (SecurityException e) {
            permissionPanel.setVisibility(View.VISIBLE);
            return;
        }
        if (!frameLoopRunning) {
            frameLoopRunning = true;
            Choreographer.getInstance().postFrameCallback(this);
        }
    }

    private void disconnect() {
        sessionManager.removeOnActiveSessionsChangedListener(sessionsListener);
        setController(null);
        if (frameLoopRunning) {
            frameLoopRunning = false;
            Choreographer.getInstance().removeFrameCallback(this);
        }
    }

    private void refreshSessions() {
        try {
            pickController(sessionManager.getActiveSessions(listenerComponent));
        } catch (SecurityException e) {
            pickController(null);
        }
    }

    /** Prefer Apple Music, and a session that is actually playing. */
    private void pickController(List<MediaController> list) {
        MediaController best = null;
        int bestScore = -1;
        if (list != null) {
            for (MediaController c : list) {
                int score = (APPLE_MUSIC.equals(c.getPackageName()) ? 2 : 0) + (isPlaying(c.getPlaybackState()) ? 1 : 0);
                if (score > bestScore) {
                    bestScore = score;
                    best = c;
                }
            }
        }
        if (best != null && controller != null && best.getSessionToken().equals(controller.getSessionToken())) {
            return;
        }
        setController(best);
        if (best == null) {
            trackKey = null;
            showTrackInfo(null, null);
            setArt(null);
            lyricsView.setMessage("没有正在播放的音乐\n在 Apple Music 里播放一首歌吧");
        }
    }

    private void setController(MediaController c) {
        if (controller != null) controller.unregisterCallback(controllerCallback);
        controller = c;
        if (c != null) {
            c.registerCallback(controllerCallback, main);
            onMetadata(c.getMetadata());
            onState(c.getPlaybackState());
        }
    }

    private static boolean isPlaying(PlaybackState s) {
        return s != null && s.getState() == PlaybackState.STATE_PLAYING;
    }

    private void onState(PlaybackState s) {
        if (s == null) {
            playing = false;
            return;
        }
        playing = isPlaying(s);
        speed = s.getPlaybackSpeed() == 0 ? 1 : s.getPlaybackSpeed();
        basePosition = s.getPosition();
        baseTime = s.getLastPositionUpdateTime() > 0 ? s.getLastPositionUpdateTime() : SystemClock.elapsedRealtime();
        playButton.setType(playing ? ControlButton.PAUSE : ControlButton.PLAY);
    }

    private long currentPosition() {
        if (!playing) return basePosition;
        return basePosition + (long) ((SystemClock.elapsedRealtime() - baseTime) * speed);
    }

    @Override
    public void doFrame(long frameTimeNanos) {
        if (!frameLoopRunning) return;
        if (controller != null) lyricsView.setPosition(currentPosition());
        Choreographer.getInstance().postFrameCallback(this);
    }

    private void onMetadata(MediaMetadata m) {
        if (m == null) return;
        Track track = Track.from(m);
        showTrackInfo(track.title, track.artist);

        Bitmap art = m.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART);
        if (art == null) art = m.getBitmap(MediaMetadata.METADATA_KEY_ART);
        if (art == null) art = m.getBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON);
        setArt(art);

        // Players often deliver metadata in several quick updates; wait for it to settle.
        if (pendingFetch != null) main.removeCallbacks(pendingFetch);
        if (track.key().equals(trackKey)) return;
        trackKey = null;
        lyricsView.setMessage("正在查找歌词…");
        sourceView.setText("");
        pendingFetch = () -> {
            pendingFetch = null;
            MediaMetadata latest = controller == null ? null : controller.getMetadata();
            Track t = latest == null ? track : Track.from(latest);
            String key = t.key();
            trackKey = key;
            io.execute(() -> {
                Lyrics lyrics = repo.fetch(t);
                main.post(() -> {
                    if (!key.equals(trackKey)) return;
                    if (lyrics == null) {
                        lyricsView.setMessage("没有找到这首歌的歌词");
                    } else if (lyrics.instrumental) {
                        lyricsView.setMessage("纯音乐，请欣赏");
                    } else {
                        lyricsView.setLyrics(lyrics);
                        lyricsView.setPosition(currentPosition());
                    }
                    sourceView.setText(lyrics == null ? "" : "歌词来源：" + lyrics.source
                            + (lyrics.synced || lyrics.instrumental ? "" : "（未同步）"));
                });
            });
        };
        main.postDelayed(pendingFetch, 350);
    }

    private void showTrackInfo(String title, String artist) {
        titleView.setText(title == null ? "" : title);
        artistView.setText(artist == null ? "" : artist);
    }

    private void setArt(Bitmap art) {
        // Players re-send the artwork with every metadata update; skip the fade if it is unchanged.
        if (art == shownArt || (art != null && shownArt != null && art.sameAs(shownArt))) {
            if (art != null || background.getDrawable() != null) return;
        }
        shownArt = art;
        headerArt.setImageBitmap(art);
        headerArt.setVisibility(art == null ? View.GONE : View.VISIBLE);
        background.animate().alpha(0f).setDuration(250).withEndAction(() -> {
            if (art == null) {
                background.setImageDrawable(new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                        new int[]{0xFF3A2D5C, 0xFF1B2A4A, 0xFF0B0B12}));
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                background.setImageBitmap(art);
            } else {
                // No RenderEffect before Android 12: a tiny bitmap stretched up blurs nicely.
                background.setImageBitmap(Bitmap.createScaledBitmap(art, 16, 16, true));
            }
            background.animate().alpha(1f).setDuration(400).start();
        }).start();
    }

    // ------------------------------------------------------------ controls

    @Override
    public void onSeek(long timeMs) {
        if (controller == null) return;
        controller.getTransportControls().seekTo(timeMs);
        basePosition = timeMs;
        baseTime = SystemClock.elapsedRealtime();
        lyricsView.setPosition(timeMs);
    }

    @Override
    public void onBackgroundTap() {
        setControlsVisible(controls.getAlpha() < 0.5f);
    }

    private void setControlsVisible(boolean visible) {
        main.removeCallbacks(hideControls);
        controls.animate().alpha(visible ? 1f : 0f).setDuration(200)
                .withStartAction(() -> {
                    if (visible) controls.setVisibility(View.VISIBLE);
                })
                .withEndAction(() -> {
                    if (!visible) controls.setVisibility(View.INVISIBLE);
                })
                .start();
        if (visible) main.postDelayed(hideControls, CONTROLS_HIDE_MS);
    }

    private void onControl(int which) {
        main.removeCallbacks(hideControls);
        main.postDelayed(hideControls, CONTROLS_HIDE_MS);
        if (controller == null) return;
        MediaController.TransportControls t = controller.getTransportControls();
        if (which == ControlButton.PREV) t.skipToPrevious();
        else if (which == ControlButton.NEXT) t.skipToNext();
        else if (playing) t.pause();
        else t.play();
    }

    private void hideSystemBars() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            //noinspection deprecation
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }

    // ------------------------------------------------------------ layout

    private View buildUi() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xFF000000);
        int match = ViewGroup.LayoutParams.MATCH_PARENT, wrap = ViewGroup.LayoutParams.WRAP_CONTENT;

        background = new ImageView(this);
        background.setScaleType(ImageView.ScaleType.CENTER_CROP);
        background.setScaleX(1.8f);
        background.setScaleY(1.8f);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            background.setRenderEffect(RenderEffect.createBlurEffect(dp(60), dp(60), Shader.TileMode.MIRROR));
        }
        root.addView(background, new FrameLayout.LayoutParams(match, match));
        bgSpin = ObjectAnimator.ofFloat(background, View.ROTATION, 0f, 360f);
        bgSpin.setDuration(120_000);
        bgSpin.setRepeatCount(ValueAnimator.INFINITE);
        bgSpin.setInterpolator(new LinearInterpolator());

        View dim = new View(this);
        dim.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{0xB3000000, 0x66000000, 0x80000000, 0xCC000000}));
        root.addView(dim, new FrameLayout.LayoutParams(match, match));

        lyricsView = new LyricsView(this);
        lyricsView.setListener(this);
        lyricsView.setMessage("");
        root.addView(lyricsView, new FrameLayout.LayoutParams(match, match));

        // Header: small artwork, title, artist.
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        int pad = dp(28);
        header.setPadding(pad, dp(20), pad, dp(12));
        headerArt = new ImageView(this);
        headerArt.setScaleType(ImageView.ScaleType.CENTER_CROP);
        headerArt.setOutlineProvider(new ViewOutlineProvider() {
            @Override
            public void getOutline(View view, Outline outline) {
                outline.setRoundRect(0, 0, view.getWidth(), view.getHeight(), dp(6));
            }
        });
        headerArt.setClipToOutline(true);
        headerArt.setVisibility(View.GONE);
        LinearLayout.LayoutParams artLp = new LinearLayout.LayoutParams(dp(48), dp(48));
        artLp.rightMargin = dp(14);
        header.addView(headerArt, artLp);
        LinearLayout texts = new LinearLayout(this);
        texts.setOrientation(LinearLayout.VERTICAL);
        titleView = label(17, 0xFFFFFFFF, 700);
        artistView = label(15, 0xA6FFFFFF, 500);
        texts.addView(titleView);
        texts.addView(artistView);
        header.addView(texts, new LinearLayout.LayoutParams(0, wrap, 1));
        root.addView(header, new FrameLayout.LayoutParams(match, wrap, Gravity.TOP));

        // Transport controls, shown on tap.
        controls = new LinearLayout(this);
        controls.setOrientation(LinearLayout.VERTICAL);
        controls.setGravity(Gravity.CENTER_HORIZONTAL);
        controls.setPadding(0, dp(40), 0, dp(28));
        controls.setBackground(new GradientDrawable(GradientDrawable.Orientation.BOTTOM_TOP,
                new int[]{0xE6000000, 0x00000000}));
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER);
        playButton = new ControlButton(this, ControlButton.PLAY);
        ControlButton[] buttons = {
                new ControlButton(this, ControlButton.PREV), playButton, new ControlButton(this, ControlButton.NEXT)};
        int[] kinds = {ControlButton.PREV, ControlButton.PLAY, ControlButton.NEXT};
        for (int i = 0; i < buttons.length; i++) {
            int kind = kinds[i];
            buttons[i].setOnClickListener(v -> onControl(kind));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(76), dp(76));
            lp.leftMargin = lp.rightMargin = dp(14);
            row.addView(buttons[i], lp);
        }
        controls.addView(row);
        sourceView = label(12, 0x80FFFFFF, 400);
        sourceView.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams srcLp = new LinearLayout.LayoutParams(wrap, wrap);
        srcLp.topMargin = dp(10);
        controls.addView(sourceView, srcLp);
        controls.setAlpha(0f);
        controls.setVisibility(View.INVISIBLE);
        root.addView(controls, new FrameLayout.LayoutParams(match, wrap, Gravity.BOTTOM));

        permissionPanel = buildPermissionPanel();
        root.addView(permissionPanel, new FrameLayout.LayoutParams(match, match));

        // Keep the header and controls clear of camera cutouts and transient bars.
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int top = 0, bottom = 0;
            if (insets.getDisplayCutout() != null) {
                top = insets.getDisplayCutout().getSafeInsetTop();
                bottom = insets.getDisplayCutout().getSafeInsetBottom();
            }
            header.setPadding(pad, dp(20) + top, pad, dp(12));
            controls.setPadding(0, dp(40), 0, dp(28) + bottom);
            return insets;
        });
        return root;
    }

    private View buildPermissionPanel() {
        LinearLayout p = new LinearLayout(this);
        p.setOrientation(LinearLayout.VERTICAL);
        p.setGravity(Gravity.CENTER);
        p.setPadding(dp(32), dp(32), dp(32), dp(32));
        p.setBackgroundColor(0xF2101014);
        p.setClickable(true);

        TextView title = label(24, 0xFFFFFFFF, 800);
        title.setSingleLine(false);
        title.setText("需要“通知使用权”");
        p.addView(title);

        TextView body = label(15, 0xBFFFFFFF, 400);
        body.setSingleLine(false);
        body.setLineSpacing(0, 1.3f);
        body.setText("安卓只允许拥有“通知使用权”的应用读取 Apple Music 正在播放的歌曲和进度。"
                + "本应用不会读取或上传你的通知内容。\n\n"
                + "如果开关是灰色、提示“受限设置”：先点下面第二个按钮进入应用信息，"
                + "点右上角 ⋮ →“允许受限制的设置”，再回来开启。");
        LinearLayout.LayoutParams bodyLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        bodyLp.topMargin = dp(16);
        bodyLp.bottomMargin = dp(28);
        p.addView(body, bodyLp);

        p.addView(pill("开启通知使用权", true, v ->
                startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))));
        View second = pill("打开应用信息", false, v -> startActivity(
                new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()))));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(12);
        p.addView(second, lp);
        return p;
    }

    private TextView pill(String text, boolean primary, View.OnClickListener click) {
        TextView b = label(16, primary ? 0xFF000000 : 0xFFFFFFFF, 700);
        b.setText(text);
        b.setGravity(Gravity.CENTER);
        b.setPadding(dp(28), dp(14), dp(28), dp(14));
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(28));
        if (primary) bg.setColor(0xFFFFFFFF);
        else bg.setStroke(dp(1), 0x80FFFFFF);
        b.setBackground(bg);
        b.setOnClickListener(click);
        return b;
    }

    private TextView label(float sp, int color, int weight) {
        TextView t = new TextView(this);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setTypeface(Typeface.create(Typeface.DEFAULT, weight, false));
        t.setSingleLine(true);
        t.setEllipsize(TextUtils.TruncateAt.END);
        return t;
    }

    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }
}
