/** 营地设施导航；与 Phaser/DOM 解耦，鼠标悬停不覆盖键盘选择。 */
export type CampFacility = 'merchant' | 'portal';
export type CampActivation = { type: 'shop'; sceneId: 1 | 2 | 3 } | { type: 'levelSelect' };

export class CampInteraction {
    private selected: CampFacility = 'merchant';
    private hovered: CampFacility | null = null;
    private enabled = true;

    get focused(): CampFacility { return this.hovered ?? this.selected; }

    navigate(direction: -1 | 1): void {
        if (!this.enabled) { return; }
        const facilities: CampFacility[] = ['merchant', 'portal'];
        const index = facilities.indexOf(this.selected);
        this.selected = facilities[(index + direction + facilities.length) % facilities.length];
        this.hovered = null;
    }

    point(facility: CampFacility | null): void {
        if (this.enabled) { this.hovered = facility; }
    }

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        if (!enabled) { this.hovered = null; }
    }

    activate(sceneId: 1 | 2 | 3, facility = this.focused): CampActivation | null {
        if (!this.enabled) { return null; }
        this.selected = facility;
        return facility === 'merchant' ? { type: 'shop', sceneId } : { type: 'levelSelect' };
    }
}
