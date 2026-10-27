/**
 * FR-10 / ARCH-17：三个区域的营地。设施导航与纯视觉独立，商店、关卡选择和
 * Esc 暂停继续复用现有 UI 契约；离营写档仍由 UiLayer 执行。
 */
import { Input, Scene, Scenes, type GameObjects } from 'phaser';
import { EventBus } from '../EventBus';
import { sceneDirector } from '../systems/sceneDirector';
import { InputGateway } from '../systems/inputGateway';
import { CURRENT_SCENE_READY, emitEvent, onEvent, offEvent } from '../events';
import { centerDesignCamera } from '../systems/viewportLayout';
import { createRegionBackdrop } from '../systems/regionBackdrop';
import { createCampScenery, type CampScenery } from '../systems/campScenery';
import { CampInteraction, type CampFacility } from '../systems/campInteraction';
import { CAMP_FACILITIES, getCampPalette } from '../data/campPresentation';
import { settingsStore } from '../domain/settingsStore';
import { economyService } from '../domain/economyService';
import { skillService } from '../domain/skillService';
import { effectiveKeys, type GameAction } from '../domain/keymap';
import { UI_TEXT } from '../../ui/i18n';

interface FacilityView {
    zone: GameObjects.Zone;
    name: GameObjects.Text;
    action: GameObjects.Text;
}

const FONT = '"Microsoft YaHei", "PingFang SC", sans-serif';

export class CampScene extends Scene {
    private sceneId: 1 | 2 | 3 = 1;
    private gateway!: InputGateway;
    private confirmKey!: Input.Keyboard.Key;
    private overlayOpen = false;
    private navigation = new CampInteraction();
    private scenery: CampScenery | null = null;
    private facilityViews = new Map<CampFacility, FacilityView>();
    private focusMarker!: GameObjects.Graphics;
    private controls!: GameObjects.Text;
    private resources!: GameObjects.Text;
    private resourceCoins = -1;
    private resourceSkp = -1;

    private onOverlay = (p: { name: string; open: boolean }): void => {
        if (!sceneDirector.isGameplay(this)) { return; }
        this.overlayOpen = p.open;
        this.navigation.setEnabled(!p.open);
        this.gateway.setInputEnabled(!p.open);
        this.gateway.clearAll();
        this.confirmKey.reset();
        this.refreshFocus();
        this.refreshResources();
        if (p.open) { if (this.scene.isActive()) { this.scene.pause(); } }
        else if (this.scene.isPaused()) { this.scene.resume(); }
    };
    private onSettings = (): void => this.refreshInstructions();

    constructor() { super('Camp'); }

    init(data: { sceneId?: number }): void {
        const sid = data.sceneId ?? 1;
        this.sceneId = sid === 2 ? 2 : sid === 3 ? 3 : 1;
        this.overlayOpen = false;
        this.navigation = new CampInteraction();
        this.facilityViews.clear();
        this.resourceCoins = -1;
        this.resourceSkp = -1;
    }

    create(): void {
        this.events.once(Scenes.Events.SHUTDOWN, this.shutdown, this);
        centerDesignCamera(this);
        createRegionBackdrop(this, this.sceneId, 0);
        this.scenery = createCampScenery(this, this.sceneId);
        this.scenery.update(this.time.now);
        const copy = UI_TEXT.camp.regions[this.sceneId];
        const palette = getCampPalette(this.sceneId);
        this.add.rectangle(42, 58, 374, 44, palette.shadow, 0.85).setOrigin(0).setDepth(8);
        this.add.rectangle(42, 58, 4, 44, palette.accent, 0.85).setOrigin(0).setDepth(8);
        this.resources = this.add.text(60, 71, '', {
            fontFamily: FONT, fontSize: '17px', color: '#f5e5bc'
        }).setDepth(9).setName('camp-resources');
        this.refreshResources();
        this.add.text(512, 170, copy.subtitle, {
            fontFamily: FONT, fontSize: '16px', color: '#d3ddcc',
            stroke: '#152332', strokeThickness: 4
        }).setOrigin(0.5).setDepth(8);
        this.add.text(512, 207, copy.title, {
            fontFamily: FONT, fontSize: '34px', fontStyle: 'bold', color: '#fff0c9',
            stroke: '#152332', strokeThickness: 6
        }).setOrigin(0.5).setDepth(8);
        this.add.text(512, 248, copy.description, {
            fontFamily: FONT, fontSize: '16px', color: '#e0e5db',
            stroke: '#152332', strokeThickness: 4
        }).setOrigin(0.5).setDepth(8);
        const player = this.add.sprite(459, 528, 'player_idle').setScale(1.5).setDepth(5).setName('camp-traveller');
        if (this.anims.exists('player-idle')) { player.play('player-idle'); }
        this.add.text(521, 606, UI_TEXT.camp.fireNote, {
            fontFamily: FONT, fontSize: '14px', color: '#d9c9a5',
            stroke: '#17222a', strokeThickness: 4
        }).setOrigin(0.5).setDepth(8);

        this.focusMarker = this.add.graphics().setDepth(7).setName('camp-interaction-focus');
        this.createFacility('merchant', UI_TEXT.camp.merchant, UI_TEXT.camp.merchantDetail);
        this.createFacility('portal', UI_TEXT.camp.portal, UI_TEXT.camp.portalDetail);
        // 操作说明位于左下方，为已有右下角装备 HUD 预留空间。
        this.add.rectangle(42, 662, 584, 77, palette.shadow, 0.82).setOrigin(0).setDepth(8);
        this.add.rectangle(42, 662, 4, 77, palette.accent, 0.85).setOrigin(0).setDepth(8);
        this.controls = this.add.text(61, 680, '', {
            fontFamily: FONT, fontSize: '16px', color: '#f4ebd4',
            stroke: '#152332', strokeThickness: 2
        }).setDepth(9);
        this.add.text(61, 710, `${UI_TEXT.camp.mouseHint}  ·  ${UI_TEXT.camp.pauseHint}`, {
            fontFamily: FONT, fontSize: '14px', color: '#c4d3cf'
        }).setDepth(9);

        this.gateway = new InputGateway(this);
        this.confirmKey = this.input.keyboard!.addKey(Input.Keyboard.KeyCodes.ENTER);
        this.input.keyboard!.addCapture(Input.Keyboard.KeyCodes.ENTER);
        onEvent('ui:overlay', this.onOverlay);
        onEvent('settings:changed', this.onSettings);
        sceneDirector.setActiveGameplay(this);
        this.refreshInstructions();
        this.cameras.main.fadeIn(400, 0, 0, 0);
        EventBus.emit(CURRENT_SCENE_READY, this);
    }

    private createFacility(facility: CampFacility, name: string, detail: string): void {
        const { x, y, width, height, labelY } = CAMP_FACILITIES[facility];
        const title = this.add.text(x, 320, name, {
            fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#e5e6d7',
            stroke: '#152332', strokeThickness: 5
        }).setOrigin(0.5).setDepth(9);
        this.add.text(x, 345, detail, {
            fontFamily: FONT, fontSize: '14px', color: '#d1ded6',
            stroke: '#152332', strokeThickness: 4
        }).setOrigin(0.5).setDepth(9);
        const action = this.add.text(x, labelY - 18, '', {
            fontFamily: FONT, fontSize: '16px', color: '#fff0c9'
        }).setOrigin(0.5).setDepth(9);
        const zone = this.add.zone(x, y, width, height).setDepth(10).setName(`camp-${facility}`)
            .setInteractive({ useHandCursor: true });
        zone.on('pointerover', () => {
            if (!this.canInteract()) { return; }
            this.navigation.point(facility);
            this.refreshFocus();
        });
        zone.on('pointerout', () => { this.navigation.point(null); this.refreshFocus(); });
        zone.on('pointerdown', (pointer: Input.Pointer) => {
            if (pointer.leftButtonDown()) { this.activate(facility); }
        });
        this.facilityViews.set(facility, { zone, name: title, action });
    }

    private keyLabel(action: GameAction): string {
        const labels: Record<string, string> = { LEFT: '←', RIGHT: '→', UP: '↑', DOWN: '↓', SPACE: 'Space' };
        return effectiveKeys(action, settingsStore.getSnapshot().keymap).map(key => labels[key] ?? key).join('/');
    }

    private refreshInstructions(): void {
        this.controls.setText(`${this.keyLabel('moveLeft')}  ${this.keyLabel('moveRight')} ${UI_TEXT.camp.choose}    ${this.keyLabel('interact')}/Enter ${UI_TEXT.camp.confirm}`);
        this.refreshFocus();
    }

    /** 直接读当前领域余额；面板关闭时也刷新，覆盖无通知事件的武器强化扣款。 */
    private refreshResources(): void {
        const coins = economyService.getCoins();
        const skp = skillService.skpBalance;
        if (coins === this.resourceCoins && skp === this.resourceSkp) { return; }
        this.resourceCoins = coins;
        this.resourceSkp = skp;
        this.resources.setText(`${UI_TEXT.hud.coins} ${coins}    ${UI_TEXT.hud.skillPoints} SKP ${skp}`);
    }

    private refreshFocus(): void {
        const focused = this.navigation.focused;
        const p = getCampPalette(this.sceneId);
        this.focusMarker.clear();
        for (const [facility, view] of this.facilityViews) {
            const active = facility === focused;
            view.name.setColor(active ? '#fff0bc' : '#d9e2d6');
            view.action.setVisible(active);
            if (!active) { continue; }
            const { x, y, width, height, labelY } = CAMP_FACILITIES[facility];
            const left = x - width / 2;
            const top = y - height / 2;
            const color = facility === 'merchant' ? p.accent : p.portal;
            this.focusMarker.fillStyle(color, 0.9);
            for (const [cx, cy, dx, dy] of [[left, top, 1, 1], [left + width, top, -1, 1],
                [left, top + height, 1, -1], [left + width, top + height, -1, -1]]) {
                this.focusMarker.fillRect(cx + Math.min(0, dx * 18), cy, 18, 3)
                    .fillRect(cx, cy + Math.min(0, dy * 18), 3, 18);
            }
            this.focusMarker.fillStyle(p.shadow, 0.95).fillRect(x - 105, labelY - 34, 210, 31);
            this.focusMarker.fillStyle(color).fillRect(x - 105, labelY - 5, 210, 2);
            const action = facility === 'merchant' ? UI_TEXT.camp.trade : UI_TEXT.camp.depart;
            view.action.setText(`${this.keyLabel('interact')}  ${action}`);
        }
    }

    private canInteract(): boolean {
        return !this.overlayOpen && !sceneDirector.isTransitioning && this.input.enabled && this.scene.isActive();
    }

    private activate(facility?: CampFacility): void {
        if (!this.canInteract()) { return; }
        const request = this.navigation.activate(this.sceneId, facility);
        if (request === null) { return; }
        this.refreshFocus();
        if (request.type === 'shop') { emitEvent('game:requestShop', { sceneId: request.sceneId }); }
        else { emitEvent('game:requestLevelSelect', { from: 'camp' }); }
    }

    update(time: number): void {
        this.navigation.setEnabled(this.canInteract());
        if (!this.canInteract()) { return; }
        this.refreshResources();
        this.scenery?.update(time);
        this.gateway.poll();
        if (this.gateway.justPressed('pause')) {
            emitEvent('game:requestPause', { reason: 'esc' });
            return;
        }
        const left = this.gateway.justPressed('moveLeft');
        const right = this.gateway.justPressed('moveRight');
        if (left !== right) {
            this.navigation.navigate(right ? 1 : -1);
            this.refreshFocus();
        }
        if (this.gateway.justPressed('interact') || Input.Keyboard.JustDown(this.confirmKey)) { this.activate(); }
    }

    shutdown(): void {
        offEvent('ui:overlay', this.onOverlay);
        offEvent('settings:changed', this.onSettings);
        this.navigation.setEnabled(false);
        this.gateway?.destroy();
        this.confirmKey?.reset();
        for (const view of this.facilityViews.values()) { view.zone.removeAllListeners(); }
        this.facilityViews.clear();
        this.scenery?.destroy();
        this.scenery = null;
        if (sceneDirector.isGameplay(this)) { sceneDirector.setActiveGameplay(null); }
    }
}
