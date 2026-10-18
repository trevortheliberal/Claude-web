package app.fslyrics;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Canvas;
import android.graphics.CornerPathEffect;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.drawable.RippleDrawable;
import android.view.View;

/** Round transport button that draws its own glyph, so no image assets are needed. */
final class ControlButton extends View {
    static final int PREV = 0, NEXT = 1, PLAY = 2, PAUSE = 3;

    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path path = new Path();
    private int type;

    ControlButton(Context context, int type) {
        super(context);
        this.type = type;
        paint.setColor(0xFFFFFFFF);
        paint.setStyle(Paint.Style.FILL);
        paint.setPathEffect(new CornerPathEffect(context.getResources().getDisplayMetrics().density * 2.5f));
        setBackground(new RippleDrawable(ColorStateList.valueOf(0x33FFFFFF), null, null));
        setClickable(true);
        updateDescription();
    }

    void setType(int type) {
        if (this.type == type) return;
        this.type = type;
        updateDescription();
        invalidate();
    }

    private void updateDescription() {
        setContentDescription(type == PREV ? "上一首" : type == NEXT ? "下一首" : type == PLAY ? "播放" : "暂停");
    }

    @Override
    protected void onDraw(Canvas canvas) {
        float cx = getWidth() / 2f, cy = getHeight() / 2f;
        float s = Math.min(getWidth(), getHeight()) * (type == PLAY || type == PAUSE ? 0.22f : 0.16f);
        path.reset();
        switch (type) {
            case PLAY:
                triangle(cx - s * 0.75f, cy, s * 1.9f, s, true);
                break;
            case PAUSE:
                canvas.drawRoundRect(cx - s * 0.9f, cy - s, cx - s * 0.25f, cy + s, s * 0.15f, s * 0.15f, paint);
                canvas.drawRoundRect(cx + s * 0.25f, cy - s, cx + s * 0.9f, cy + s, s * 0.15f, s * 0.15f, paint);
                return;
            case NEXT:
                triangle(cx - s * 1.5f, cy, s * 1.5f, s, true);
                triangle(cx, cy, s * 1.5f, s, true);
                break;
            case PREV:
                triangle(cx + s * 1.5f, cy, s * 1.5f, s, false);
                triangle(cx, cy, s * 1.5f, s, false);
                break;
        }
        canvas.drawPath(path, paint);
    }

    /** Triangle whose flat side is at x, pointing right (or left). */
    private void triangle(float x, float cy, float len, float halfH, boolean right) {
        float tip = right ? x + len : x - len;
        path.moveTo(x, cy - halfH);
        path.lineTo(tip, cy);
        path.lineTo(x, cy + halfH);
        path.close();
    }
}
