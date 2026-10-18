package app.fslyrics;

import android.content.Context;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Finds lyrics for a track: local cache first, then LRCLIB (good for
 * English-language music), then NetEase Cloud Music (good for Chinese music,
 * and it often carries a translation). Synced lyrics are preferred over plain
 * text from any source. All methods block; call them off the main thread.
 */
final class LyricsRepository {
    private static final String TAG = "LyricsRepository";
    private static final String LRCLIB_UA = "FullscreenLyrics/1.0 (https://github.com/trevortheliberal/claude-web)";
    private static final String BROWSER_UA =
            "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";

    // "(feat. X)", "[Remastered 2011]", "（Live版）" ...
    private static final Pattern TITLE_DECORATION = Pattern.compile(
            "\\s*[(\\[（【][^)\\]）】]*(feat|ft\\.|with |remaster|version|edit|mix|live|版)[^)\\]）】]*[)\\]）】]",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern TITLE_SUFFIX = Pattern.compile(
            "\\s+-\\s+.*(remaster|version|edit|mix|live|mono|stereo).*$", Pattern.CASE_INSENSITIVE);
    private static final Pattern ARTIST_SPLIT = Pattern.compile(
            "\\s*(?:&|,|，|、|;|\\bfeat\\.|\\bft\\.)\\s*", Pattern.CASE_INSENSITIVE);
    private static final Pattern ALBUM_SUFFIX = Pattern.compile("\\s+-\\s+(single|ep)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern NON_WORD = Pattern.compile("[\\p{P}\\p{S}\\p{Z}\\s]+");

    private final File cacheDir;

    LyricsRepository(Context context) {
        cacheDir = new File(context.getFilesDir(), "lyrics");
        //noinspection ResultOfMethodCallIgnored
        cacheDir.mkdirs();
    }

    /** Raw lyric text as returned by a source, before parsing. */
    private static final class Raw {
        String synced;
        String translation;
        String plain;
        boolean instrumental;
        String source;

        boolean hasSynced() {
            return synced != null && !LrcParser.parse(synced).isEmpty();
        }

        boolean hasPlain() {
            return plain != null && !plain.trim().isEmpty();
        }
    }

    Lyrics fetch(Track track) {
        if (track.title.isEmpty()) return null;
        File cacheFile = new File(cacheDir, sha1(track.key() + "\u0001" + track.durationMs / 1000) + ".json");
        Raw raw = readCache(cacheFile);
        if (raw == null) {
            raw = fetchRemote(track);
            if (raw != null) writeCache(cacheFile, raw);
        }
        return raw == null ? null : toLyrics(raw);
    }

    private Raw fetchRemote(Track t) {
        Raw lrclib = safe(() -> lrclib(t));
        if (lrclib != null && (lrclib.hasSynced() || lrclib.instrumental)) return lrclib;
        Raw netease = safe(() -> netease(t));
        if (netease != null && netease.hasSynced()) return netease;
        if (lrclib != null && lrclib.hasPlain()) return lrclib;
        return netease != null && netease.hasPlain() ? netease : null;
    }

    private static Lyrics toLyrics(Raw raw) {
        if (raw.instrumental) {
            return new Lyrics(LrcParser.parsePlain(""), false, true, raw.source);
        }
        List<LyricLine> lines = LrcParser.parse(raw.synced);
        if (!lines.isEmpty()) {
            if (raw.translation != null) {
                LrcParser.mergeTranslation(lines, LrcParser.parse(raw.translation));
            }
            return new Lyrics(lines, true, false, raw.source);
        }
        lines = LrcParser.parsePlain(raw.plain);
        return lines.isEmpty() ? null : new Lyrics(lines, false, false, raw.source);
    }

    // ---------------------------------------------------------------- LRCLIB

    private Raw lrclib(Track t) throws IOException, JSONException {
        String title = cleanTitle(t.title);
        String artist = primaryArtist(t.artist);
        long durSec = Math.round(t.durationMs / 1000.0);

        // Exact lookup with the full metadata first: it is the most precise match.
        if (!t.artist.isEmpty() && durSec > 0) {
            Raw r = lrclibGet(t.title, t.artist, cleanAlbum(t.album), durSec);
            if (r != null) return r;
            if (!title.equals(t.title) || !artist.equals(t.artist)) {
                r = lrclibGet(title, artist, null, durSec);
                if (r != null) return r;
            }
        }

        String url = "https://lrclib.net/api/search?track_name=" + enc(title)
                + (artist.isEmpty() ? "" : "&artist_name=" + enc(artist));
        Raw r = lrclibPickBest(httpGet(url, LRCLIB_UA, null), t);
        if (r != null) return r;
        return lrclibPickBest(httpGet("https://lrclib.net/api/search?q=" + enc((title + " " + artist).trim()),
                LRCLIB_UA, null), t);
    }

    private Raw lrclibGet(String title, String artist, String album, long durSec)
            throws IOException, JSONException {
        String url = "https://lrclib.net/api/get?track_name=" + enc(title)
                + "&artist_name=" + enc(artist)
                + (album == null || album.isEmpty() ? "" : "&album_name=" + enc(album))
                + "&duration=" + durSec;
        String body = httpGet(url, LRCLIB_UA, null);
        return body == null ? null : lrclibRaw(new JSONObject(body));
    }

    private static Raw lrclibPickBest(String body, Track t) throws JSONException {
        if (body == null) return null;
        JSONArray arr = new JSONArray(body);
        JSONObject best = null;
        int bestScore = Integer.MAX_VALUE;
        String wantTitle = normalize(cleanTitle(t.title));
        for (int i = 0; i < arr.length(); i++) {
            JSONObject o = arr.getJSONObject(i);
            long diffSec = t.durationMs > 0
                    ? Math.abs(Math.round(o.optDouble("duration", 0)) - Math.round(t.durationMs / 1000.0))
                    : 0;
            if (diffSec > 5) continue;
            boolean synced = !o.isNull("syncedLyrics") && !o.optString("syncedLyrics").isEmpty();
            boolean titleMatch = normalize(o.optString("trackName")).equals(wantTitle);
            int score = (int) diffSec + (synced ? 0 : 100) + (titleMatch ? 0 : 10);
            if (score < bestScore) {
                bestScore = score;
                best = o;
            }
        }
        return best == null ? null : lrclibRaw(best);
    }

    private static Raw lrclibRaw(JSONObject o) {
        Raw r = new Raw();
        r.source = "LRCLIB";
        r.instrumental = o.optBoolean("instrumental", false);
        if (!o.isNull("syncedLyrics")) r.synced = o.optString("syncedLyrics", null);
        if (!o.isNull("plainLyrics")) r.plain = o.optString("plainLyrics", null);
        return r;
    }

    // --------------------------------------------------------------- NetEase

    private Raw netease(Track t) throws IOException, JSONException {
        String title = cleanTitle(t.title);
        String artist = primaryArtist(t.artist);
        String body = httpGet("https://music.163.com/api/search/get/web?type=1&offset=0&limit=10&s="
                + enc((title + " " + artist).trim()), BROWSER_UA, "https://music.163.com/");
        if (body == null) return null;
        JSONObject result = new JSONObject(body).optJSONObject("result");
        JSONArray songs = result == null ? null : result.optJSONArray("songs");
        if (songs == null) return null;

        String wantTitle = normalize(title);
        String wantArtist = normalize(artist);
        long bestId = -1;
        long bestScore = Long.MAX_VALUE;
        for (int i = 0; i < songs.length(); i++) {
            JSONObject s = songs.getJSONObject(i);
            String name = normalize(s.optString("name"));
            boolean titleMatch = !name.isEmpty() && (name.equals(wantTitle)
                    || name.contains(wantTitle) || wantTitle.contains(name));
            boolean artistMatch = false;
            JSONArray artists = s.optJSONArray("artists");
            if (artists != null) {
                for (int k = 0; k < artists.length(); k++) {
                    String a = normalize(artists.getJSONObject(k).optString("name"));
                    if (!a.isEmpty() && (a.equals(wantArtist) || wantArtist.contains(a) || a.contains(wantArtist))) {
                        artistMatch = true;
                    }
                }
            }
            long diff = t.durationMs > 0 ? Math.abs(s.optLong("duration", 0) - t.durationMs) : 0;
            boolean acceptable = (titleMatch && diff <= 6000) || (artistMatch && diff <= 2500);
            if (!acceptable) continue;
            long score = diff + (titleMatch ? 0 : 20_000) + (artistMatch ? 0 : 10_000);
            if (score < bestScore) {
                bestScore = score;
                bestId = s.optLong("id", -1);
            }
        }
        if (bestId < 0) return null;

        body = httpGet("https://music.163.com/api/song/lyric?id=" + bestId + "&lv=-1&kv=-1&tv=-1",
                BROWSER_UA, "https://music.163.com/");
        if (body == null) return null;
        JSONObject o = new JSONObject(body);
        Raw r = new Raw();
        r.source = "网易云音乐";
        JSONObject lrc = o.optJSONObject("lrc");
        JSONObject tlyric = o.optJSONObject("tlyric");
        if (lrc != null) r.synced = lrc.optString("lyric", null);
        if (tlyric != null) r.translation = tlyric.optString("lyric", null);
        if (r.synced != null && !r.hasSynced()) {
            r.plain = r.synced;
            r.synced = null;
        }
        return r;
    }

    // --------------------------------------------------------------- helpers

    static String cleanTitle(String title) {
        String s = TITLE_DECORATION.matcher(title).replaceAll("");
        s = TITLE_SUFFIX.matcher(s).replaceAll("");
        s = s.trim();
        return s.isEmpty() ? title : s;
    }

    static String primaryArtist(String artist) {
        String[] parts = ARTIST_SPLIT.split(artist);
        return parts.length > 0 && !parts[0].trim().isEmpty() ? parts[0].trim() : artist;
    }

    private static String cleanAlbum(String album) {
        return ALBUM_SUFFIX.matcher(album).replaceAll("").trim();
    }

    private static String normalize(String s) {
        return NON_WORD.matcher(s.toLowerCase(Locale.ROOT)).replaceAll("");
    }

    private static String enc(String s) {
        try {
            return URLEncoder.encode(s, "UTF-8");
        } catch (IOException e) {
            throw new AssertionError(e);
        }
    }

    /** Returns the body for a 200 response, or null for any other status. */
    private static String httpGet(String url, String userAgent, String referer) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        try {
            c.setConnectTimeout(8000);
            c.setReadTimeout(10000);
            c.setRequestProperty("User-Agent", userAgent);
            c.setRequestProperty("Accept", "application/json");
            if (referer != null) c.setRequestProperty("Referer", referer);
            if (c.getResponseCode() != 200) return null;
            try (InputStream in = c.getInputStream()) {
                return new String(readAll(in), StandardCharsets.UTF_8);
            }
        } finally {
            c.disconnect();
        }
    }

    private static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        return out.toByteArray();
    }

    private interface Source {
        Raw get() throws IOException, JSONException;
    }

    private static Raw safe(Source s) {
        try {
            return s.get();
        } catch (IOException | JSONException | RuntimeException e) {
            Log.w(TAG, "lyrics source failed", e);
            return null;
        }
    }

    private static Raw readCache(File f) {
        if (!f.exists()) return null;
        try (InputStream in = new FileInputStream(f)) {
            JSONObject o = new JSONObject(new String(readAll(in), StandardCharsets.UTF_8));
            Raw r = new Raw();
            r.synced = o.optString("synced", null);
            r.translation = o.optString("translation", null);
            r.plain = o.optString("plain", null);
            r.instrumental = o.optBoolean("instrumental");
            r.source = o.optString("source", "");
            return r;
        } catch (IOException | JSONException e) {
            //noinspection ResultOfMethodCallIgnored
            f.delete();
            return null;
        }
    }

    private static void writeCache(File f, Raw r) {
        try (OutputStream out = new FileOutputStream(f)) {
            JSONObject o = new JSONObject();
            o.put("synced", r.synced);
            o.put("translation", r.translation);
            o.put("plain", r.plain);
            o.put("instrumental", r.instrumental);
            o.put("source", r.source);
            out.write(o.toString().getBytes(StandardCharsets.UTF_8));
        } catch (IOException | JSONException e) {
            Log.w(TAG, "cache write failed", e);
        }
    }

    private static String sha1(String s) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-1").digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : d) sb.append(String.format(Locale.ROOT, "%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return Integer.toHexString(s.hashCode());
        }
    }
}
