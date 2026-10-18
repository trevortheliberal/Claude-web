package app.fslyrics;

final class LyricLine {
    /** Start time in ms, or -1 for unsynced (plain) lyrics. */
    final long time;
    final String text;
    String translation;

    LyricLine(long time, String text) {
        this.time = time;
        this.text = text;
    }
}
