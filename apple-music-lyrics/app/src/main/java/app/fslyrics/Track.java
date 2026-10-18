package app.fslyrics;

import android.media.MediaMetadata;

final class Track {
    final String title;
    final String artist;
    final String album;
    final long durationMs;

    Track(String title, String artist, String album, long durationMs) {
        this.title = title == null ? "" : title.trim();
        this.artist = artist == null ? "" : artist.trim();
        this.album = album == null ? "" : album.trim();
        this.durationMs = Math.max(0, durationMs);
    }

    static Track from(MediaMetadata m) {
        String artist = m.getString(MediaMetadata.METADATA_KEY_ARTIST);
        if (artist == null || artist.isEmpty()) {
            artist = m.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST);
        }
        return new Track(
                m.getString(MediaMetadata.METADATA_KEY_TITLE),
                artist,
                m.getString(MediaMetadata.METADATA_KEY_ALBUM),
                m.getLong(MediaMetadata.METADATA_KEY_DURATION));
    }

    String key() {
        return title + "\u0001" + artist + "\u0001" + album;
    }
}
