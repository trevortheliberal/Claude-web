package app.fslyrics;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Typeface;
import android.os.SystemClock;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextPaint;
import android.util.TypedValue;
import android.view.GestureDetector;
import android.view.MotionEvent;
import android.view.View;
import android.widget.OverScroller;

import java.util.Collections;
import java.util.List;

/**
 * Apple-Music-style lyrics: big bold lines, the current one bright and the
 * rest dimmed, scrolling with a staggered "wave". Drag to browse (auto-follow
 * resumes after a few seconds), tap a line to seek to it.
 */
final class LyricsView extends View {
    interface Listener {
        void onSeek(long timeMs);

        void onBackgroundTap();
    }

    private static final long RESUME_AUTO_SCROLL_MS = 3000;

    private final TextPaint mainPaint = new TextPaint(TextPaint.ANTI_ALIAS_FLAG);
    private final TextPaint transPaint = new TextPaint(TextPaint.ANTI_ALIAS_FLAG);
    private final TextPaint hintPaint = new TextPaint(TextPaint.ANTI_ALIAS_FLAG);
    private final float padH, lineGap, transGap, fadeLen;
    private final OverScroller scroller;
    private final GestureDetector gestures;

    private Listener listener;
    private List<LyricLine> lines = Collections.emptyList();
    private boolean synced;
    private String message;

    private StaticLayout[] mainLayouts = new StaticLayout[0];
    private StaticLayout[] transLayouts = new StaticLayout[0];
    private StaticLayout messageLayout;
    private float[] tops = new float[0];      // top of each line block in content space
    private float[] heights = new float[0];
    private float[] offsets = new float[0];   // per-line animated scroll, lags for the wave effect
    private float[] emphasis = new float[0];  // 0 = dimmed, 1 = current line
    private int laidOutWidth = -1;

    private int active = -1;
    private float manualScroll;
    private boolean manual;
    private boolean touching;
    private long lastTouchUptime;
    private float manualGlow;
    private long lastFrameNanos;

    LyricsView(Context context) {
        super(context);
        padH = dp(28);
        lineGap = dp(26);
        transGap = dp(6);
        fadeLen = dp(90);

        mainPaint.setColor(0xFFFFFFFF);
        mainPaint.setTextSize(sp(30));
        mainPaint.setTypeface(Typeface.create(Typeface.DEFAULT, 800, false));
        transPaint.setColor(0xFFFFFFFF);
        transPaint.setTextSize(sp(19));
        transPaint.setTypeface(Typeface.create(Typeface.DEFAULT, 600, false));
        hintPaint.setColor(0xB3FFFFFF);
        hintPaint.setTextSize(sp(20));
        hintPaint.setTypeface(Typeface.create(Typeface.DEFAULT, 600, false));

        scroller = new OverScroller(context);
        gestures = new GestureDetector(context, new GestureDetector.SimpleOnGestureListener() {
            @Override
            public boolean onDown(MotionEvent e) {
                return true;
            }

            @Override
            public boolean onScroll(MotionEvent e1, MotionEvent e2, float dx, float dy) {
                if (lines.isEmpty()) return false;
                if (!manual) {
                    manual = true;
                    manualScroll = offsets[Math.max(0, active)];
                }
                manualScroll = clampScroll(manualScroll + dy);
                invalidate();
                return true;
            }

            @Override
            public boolean onFling(MotionEvent e1, MotionEvent e2, float vx, float vy) {
                if (!manual) return false;
                scroller.fling(0, Math.round(manualScroll), 0, Math.round(-vy),
                        0, 0, Math.round(minScroll()), Math.round(maxScroll()));
                invalidate();
                return true;
            }

            @Override
            public boolean onSingleTapUp(MotionEvent e) {
                int hit = lineAt(e.getY());
                if (hit >= 0 && synced && listener != null) {
                    manual = false;
                    scroller.forceFinished(true);
                    listener.onSeek(lines.get(hit).time);
                } else if (listener != null) {
                    listener.onBackgroundTap();
                }
                return true;
            }
        });
    }

    void setListener(Listener l) {
        listener = l;
    }

    void setLyrics(Lyrics lyrics) {
        message = null;
        messageLayout = null;
        lines = lyrics.lines;
        synced = lyrics.synced;
        active = -1;
        manual = !synced;
        manualScroll = 0;
        scroller.forceFinished(true);
        laidOutWidth = -1;
        relayout();
        invalidate();
    }

    void setMessage(String text) {
        lines = Collections.emptyList();
        message = text;
        messageLayout = null;
        laidOutWidth = -1;
        relayout();
        invalidate();
    }

    void setPosition(long ms) {
        if (!synced || lines.isEmpty()) return;
        // Last line whose start time has passed.
        int lo = 0, hi = lines.size() - 1, idx = -1;
        while (lo <= hi) {
            int mid = (lo + hi) >>> 1;
            if (lines.get(mid).time <= ms) {
                idx = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        if (idx != active) {
            active = idx;
            invalidate();
        }
    }

    @Override
    protected void onSizeChanged(int w, int h, int oldw, int oldh) {
        relayout();
    }

    private void relayout() {
        int w = getWidth();
        if (w <= 0 || w == laidOutWidth) return;
        laidOutWidth = w;
        int textWidth = Math.max(1, Math.round(w - padH * 2));

        if (message != null) {
            messageLayout = StaticLayout.Builder.obtain(message, 0, message.length(), hintPaint, textWidth)
                    .setAlignment(Layout.Alignment.ALIGN_CENTER)
                    .build();
        }

        int n = lines.size();
        mainLayouts = new StaticLayout[n];
        transLayouts = new StaticLayout[n];
        tops = new float[n];
        heights = new float[n];
        float y = 0;
        for (int i = 0; i < n; i++) {
            LyricLine l = lines.get(i);
            mainLayouts[i] = StaticLayout.Builder.obtain(l.text, 0, l.text.length(), mainPaint, textWidth)
                    .setLineSpacing(0, 1.05f)
                    .build();
            float h = mainLayouts[i].getHeight();
            if (l.translation != null) {
                transLayouts[i] = StaticLayout.Builder.obtain(
                        l.translation, 0, l.translation.length(), transPaint, textWidth).build();
                h += transGap + transLayouts[i].getHeight();
            }
            tops[i] = y;
            heights[i] = h;
            y += h + lineGap;
        }

        float target = targetScroll();
        offsets = new float[n];
        emphasis = new float[n];
        for (int i = 0; i < n; i++) {
            offsets[i] = target;
            emphasis[i] = (!synced || i == active) ? 1 : 0;
        }
    }

    private float anchor() {
        return getHeight() * 0.3f;
    }

    private float targetScroll() {
        if (manual) return manualScroll;
        return tops.length == 0 ? 0 : tops[Math.max(0, active)];
    }

    private float minScroll() {
        return -anchor() + dp(60);
    }

    private float maxScroll() {
        return tops.length == 0 ? 0 : tops[tops.length - 1];
    }

    private float clampScroll(float s) {
        return Math.max(minScroll(), Math.min(maxScroll(), s));
    }

    private int lineAt(float screenY) {
        float a = anchor();
        for (int i = 0; i < lines.size(); i++) {
            float y = a + tops[i] - offsets[i];
            if (screenY >= y - lineGap / 2 && screenY <= y + heights[i] + lineGap / 2) return i;
        }
        return -1;
    }

    @Override
    public boolean onTouchEvent(MotionEvent ev) {
        switch (ev.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                touching = true;
                scroller.forceFinished(true);
                break;
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                touching = false;
                lastTouchUptime = SystemClock.uptimeMillis();
                invalidate();
                break;
        }
        gestures.onTouchEvent(ev);
        return true;
    }

    @Override
    protected void onDraw(Canvas canvas) {
        long now = System.nanoTime();
        float dt = lastFrameNanos == 0 ? 0.016f : Math.min(0.05f, (now - lastFrameNanos) / 1e9f);
        lastFrameNanos = now;
        boolean animating = false;

        if (messageLayout != null && lines.isEmpty()) {
            canvas.save();
            canvas.translate(padH, (getHeight() - messageLayout.getHeight()) / 2f);
            messageLayout.draw(canvas);
            canvas.restore();
            lastFrameNanos = 0;
            return;
        }

        if (scroller.computeScrollOffset()) {
            manualScroll = scroller.getCurrY();
            animating = true;
        }
        if (manual && synced) {
            if (!touching && scroller.isFinished()
                    && SystemClock.uptimeMillis() - lastTouchUptime > RESUME_AUTO_SCROLL_MS) {
                manual = false;
            } else {
                animating = true; // keep ticking so we notice when to resume
            }
        }
        manualGlow = approach(manualGlow, manual && synced ? 1 : 0, 6, dt);

        float target = targetScroll();
        float anchor = anchor();
        float h = getHeight();
        int n = lines.size();
        int pivot = Math.max(0, active);

        for (int i = 0; i < n; i++) {
            if (manual) {
                offsets[i] = target;
            } else {
                float d = target - offsets[i];
                // Lines further from the current one react later, giving the wave.
                int dist = d > 0 ? Math.max(0, i - pivot) : Math.max(0, pivot - i);
                float rate = 10f / (1f + 0.22f * Math.min(dist, 8));
                offsets[i] = Math.abs(d) < 0.5f ? target : approach(offsets[i], target, rate, dt);
                if (offsets[i] != target) animating = true;
            }
            float e = (!synced || i == active) ? 1 : 0;
            emphasis[i] = approach(emphasis[i], e, 9, dt);
            if (Math.abs(emphasis[i] - e) > 0.003f) animating = true;
        }

        for (int i = 0; i < n; i++) {
            float y = anchor + tops[i] - offsets[i];
            if (y > h || y + heights[i] < 0) continue;

            float e = emphasis[i];
            float alpha = synced ? 0.3f + 0.7f * e : 0.9f;
            alpha = Math.max(alpha, 0.6f * manualGlow);
            float mid = y + heights[i] / 2;
            alpha *= clamp01((mid - dp(70)) / fadeLen) * clamp01((h - mid) / fadeLen);
            if (alpha <= 0.01f) continue;
            float scale = synced ? 0.93f + 0.07f * e : 1f;

            canvas.save();
            canvas.translate(padH, y);
            canvas.scale(scale, scale);
            mainPaint.setAlpha(Math.round(255 * alpha));
            mainLayouts[i].draw(canvas);
            if (transLayouts[i] != null) {
                canvas.translate(0, mainLayouts[i].getHeight() + transGap);
                transPaint.setAlpha(Math.round(255 * alpha * 0.8f));
                transLayouts[i].draw(canvas);
            }
            canvas.restore();
        }

        if (animating) {
            postInvalidateOnAnimation();
        } else {
            lastFrameNanos = 0;
        }
    }

    /** Frame-rate independent exponential approach. */
    private static float approach(float from, float to, float rate, float dt) {
        return from + (to - from) * (1f - (float) Math.exp(-rate * dt));
    }

    private static float clamp01(float v) {
        return Math.max(0, Math.min(1, v));
    }

    private float dp(float v) {
        return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    private float sp(float v) {
        return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, v, getResources().getDisplayMetrics());
    }
}
