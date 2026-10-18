package app.fslyrics;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class LrcParser {
    private static final Pattern TIME = Pattern.compile("\\[(\\d{1,3}):(\\d{1,2})(?:[.:](\\d{1,3}))?\\]");
    private static final Pattern OFFSET = Pattern.compile("\\[offset:\\s*([+-]?\\d+)\\s*\\]", Pattern.CASE_INSENSITIVE);
    // Word-level timing tags from "enhanced" LRC, e.g. <00:12.34>
    private static final Pattern WORD_TAG = Pattern.compile("<\\d{1,3}:\\d{1,2}(?:[.:]\\d{1,3})?>");

    private LrcParser() {
    }

    static List<LyricLine> parse(String lrc) {
        List<LyricLine> out = new ArrayList<>();
        if (lrc == null || lrc.isEmpty()) return out;

        long offset = 0;
        Matcher om = OFFSET.matcher(lrc);
        if (om.find()) {
            try {
                offset = Long.parseLong(om.group(1));
            } catch (NumberFormatException ignored) {
            }
        }

        List<Long> times = new ArrayList<>();
        for (String raw : lrc.split("\\r?\\n")) {
            String line = raw.trim();
            Matcher m = TIME.matcher(line);
            times.clear();
            int pos = 0;
            while (pos < line.length()) {
                m.region(pos, line.length());
                if (!m.lookingAt()) break;
                times.add(toMs(m.group(1), m.group(2), m.group(3)));
                pos = m.end();
            }
            if (times.isEmpty()) continue;
            String text = WORD_TAG.matcher(line.substring(pos)).replaceAll("").trim();
            if (text.isEmpty()) continue;
            for (long t : times) {
                out.add(new LyricLine(Math.max(0, t - offset), text));
            }
        }
        out.sort((a, b) -> Long.compare(a.time, b.time));
        return out;
    }

    static List<LyricLine> parsePlain(String text) {
        List<LyricLine> out = new ArrayList<>();
        if (text == null) return out;
        for (String raw : text.split("\\r?\\n")) {
            String line = raw.trim();
            if (!line.isEmpty()) out.add(new LyricLine(-1, line));
        }
        return out;
    }

    /** Attaches each translated line to the original line with the same timestamp. */
    static void mergeTranslation(List<LyricLine> lines, List<LyricLine> translated) {
        int j = 0;
        for (LyricLine t : translated) {
            if (t.text.equals("//")) continue;
            while (j < lines.size() && lines.get(j).time < t.time - 50) j++;
            if (j >= lines.size()) break;
            LyricLine l = lines.get(j);
            if (Math.abs(l.time - t.time) <= 50 && !l.text.equals(t.text)) {
                l.translation = t.text;
            }
        }
    }

    private static long toMs(String min, String sec, String frac) {
        long ms = (Long.parseLong(min) * 60 + Long.parseLong(sec)) * 1000;
        if (frac != null) {
            long f = Long.parseLong(frac);
            if (frac.length() == 1) f *= 100;
            else if (frac.length() == 2) f *= 10;
            ms += f;
        }
        return ms;
    }
}
