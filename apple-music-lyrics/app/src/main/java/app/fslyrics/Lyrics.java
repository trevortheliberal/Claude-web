package app.fslyrics;

import java.util.Collections;
import java.util.List;

final class Lyrics {
    final List<LyricLine> lines;
    final boolean synced;
    final boolean instrumental;
    final String source;

    Lyrics(List<LyricLine> lines, boolean synced, boolean instrumental, String source) {
        this.lines = Collections.unmodifiableList(lines);
        this.synced = synced;
        this.instrumental = instrumental;
        this.source = source;
    }
}
