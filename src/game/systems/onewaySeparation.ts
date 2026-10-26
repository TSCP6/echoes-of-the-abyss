/**
 * 单向平台分离判定（纯函数，无 Phaser 值导入 → Node 可测，TT-01）。
 * 扫掠模型：仅当玩家下落（vy>0）且上一帧底边在瓦片顶之上（容差 2px）才分离。
 * 回归背景：旧容差模型（bottom <= top + 4）在帧穿透 >4px（高速下落/低帧率）时放行 → 穿透平台。
 */
export interface OnewayBodyLike {
    velocity: { y: number };
    bottom: number;
    deltaY(): number;
}

export function shouldSeparateOneway(body: OnewayBodyLike, tileTopY: number): boolean {
    if (body.velocity.y <= 0) { return false; }
    const prevBottom = body.bottom - body.deltaY();
    return prevBottom <= tileTopY + 2;
}
