import { describe, expect, it } from 'vitest';
import { CampInteraction } from '../../../../src/game/systems/world/campInteraction';

describe('营地设施选择与使用', () => {
    it('进入营地即可交互商人，左右选择会循环经过出发门', () => {
        const camp = new CampInteraction();
        expect(camp.activate(2)).toEqual({ type: 'shop', sceneId: 2 });
        camp.navigate(1);
        expect(camp.focused).toBe('portal');
        expect(camp.activate(2)).toEqual({ type: 'levelSelect' });
        camp.navigate(1);
        expect(camp.focused).toBe('merchant');
        camp.navigate(-1);
        expect(camp.focused).toBe('portal');
    });

    it('鼠标悬停暂时显示目标，移出后保留原键盘选择', () => {
        const camp = new CampInteraction();
        camp.point('portal');
        expect(camp.focused).toBe('portal');
        camp.point(null);
        expect(camp.focused).toBe('merchant');
        camp.point('portal');
        camp.navigate(1);
        expect(camp.focused).toBe('portal');
        camp.point(null);
        expect(camp.focused).toBe('portal');
    });

    it('点击直接使用目标并让后续键盘交互继续作用于该设施', () => {
        const camp = new CampInteraction();
        expect(camp.activate(3, 'portal')).toEqual({ type: 'levelSelect' });
        expect(camp.activate(3)).toEqual({ type: 'levelSelect' });
        expect(camp.activate(3, 'merchant')).toEqual({ type: 'shop', sceneId: 3 });
        expect(camp.activate(1)).toEqual({ type: 'shop', sceneId: 1 });
    });

    it('打开面板或切场景时拒绝选择与使用，恢复后清掉旧悬停', () => {
        const camp = new CampInteraction();
        camp.point('portal');
        camp.setEnabled(false);
        camp.navigate(1);
        camp.point('portal');
        expect(camp.activate(1, 'portal')).toBeNull();
        camp.setEnabled(true);
        expect(camp.focused).toBe('merchant');
        expect(camp.activate(1)).toEqual({ type: 'shop', sceneId: 1 });
    });
});
