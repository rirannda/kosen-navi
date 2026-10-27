import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Map from '../Map.svelte';
import { createNavigationState } from '../../states/navigation.svelte';
import { pois } from '../../../data/pois';

function mockMaps(ready: Promise<void> = Promise.resolve()) {
	const signals: AbortSignal[] = [];
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
		if (init?.signal) signals.push(init.signal);
		await ready;
		return new Response(
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 1700"><path id="hr_1-1" d="M514.5 1151h33v31.5h-33z"/><path id="hr_1-2" d="M481.5 1151h33v31.5h-33z"/></svg>'
		);
	});
	return signals;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('Map shared navigation', () => {
	it('親の選択・解除を表示し、地図上の選択を同じモデルへ返す', async () => {
		mockMaps();
		const navigation = createNavigationState();
		const { component, container, getByRole } = await render(Map, { props: { navigation } });
		await expect.poll(() => container.querySelector('.leaflet-overlay-pane svg')).not.toBeNull();
		component.focusOnPoiId('poi_hr_1-1');
		await expect
			.poll(() => container.querySelector('.leaflet-zoom-anim, .leaflet-pan-anim'), {
				timeout: 3000
			})
			.toBeNull();
		const transform = container.querySelector<HTMLElement>('.leaflet-map-pane')!.style.transform;
		navigation.setHighlight('poi_hr_1-1', 'start');
		navigation.setHighlight('poi_hr_1-2');
		await expect
			.poll(() => container.querySelector('.poi-color-selected.poi-highlight')?.id)
			.toBe('hr_1-2');
		expect(container.querySelector<HTMLElement>('.leaflet-map-pane')!.style.transform).toBe(
			transform
		);
		await getByRole('button', { name: 'HR教室:1-1', exact: true }).click();
		expect(navigation.selectedPoi?.id).toBe('poi_hr_1-1');
		expect(navigation.highlights.start).toBe('poi_hr_1-1');
		navigation.clearHighlight('selected');
		await expect
			.poll(() => container.querySelector('.poi-color-selected.poi-highlight'))
			.toBeNull();
		expect(container.querySelector('.poi-color-start.poi-highlight')?.id).toBe('hr_1-1');
	});

	it('旧バインディングも親から変更・解除できる', async () => {
		mockMaps();
		const { component, container, rerender } = await render(Map);
		await expect.poll(() => container.querySelector('.leaflet-overlay-pane svg')).not.toBeNull();
		component.focusOnPoiId('poi_hr_1-1');
		await rerender({ selectedPoi: pois.find((poi) => poi.id === 'poi_hr_1-1')! });
		await expect.poll(() => container.querySelector('.poi-highlight')?.id).toBe('hr_1-1');
		await rerender({ selectedPoi: null });
		await expect.poll(() => container.querySelector('.poi-highlight')).toBeNull();
	});

	it('親で確定・解除した経路を反映し、再マウントでも親の選択を保持する', async () => {
		mockMaps();
		const navigation = createNavigationState();
		navigation.setHighlight('poi_hr_1-1');
		navigation.showRoute('node_la_f1_hr_1-1', 'node_la_f1_hr_1-2');
		const first = await render(Map, { props: { navigation } });
		await expect.poll(() => first.container.querySelector('.route-endpoint-start')).not.toBeNull();
		navigation.clearRoute();
		await expect.poll(() => first.container.querySelector('.route-endpoint-label')).toBeNull();
		await expect
			.poll(() => first.container.querySelector('.leaflet-zoom-anim, .leaflet-pan-anim'), {
				timeout: 3000
			})
			.toBeNull();
		await first.unmount();
		expect(navigation.selectedPoi?.id).toBe('poi_hr_1-1');
		const second = await render(Map, { props: { navigation } });
		await expect
			.poll(() => second.container.querySelector('.leaflet-overlay-pane svg'))
			.not.toBeNull();
		second.component.focusOnPoiId('poi_hr_1-1');
		await expect.poll(() => second.container.querySelector('.poi-highlight')?.id).toBe('hr_1-1');
		expect(second.container.querySelector('.route-endpoint-marker')).toBeNull();
	});

	it('読み込み中に破棄した地図は取得を中断し、親の状態やDOMを変更しない', async () => {
		let finish!: () => void;
		const signals = mockMaps(
			new Promise<void>((resolve) => {
				finish = resolve;
			})
		);
		const navigation = createNavigationState();
		navigation.setHighlight('poi_hr_1-1');
		const errors = vi.spyOn(console, 'error');
		const { container, unmount } = await render(Map, { props: { navigation } });
		await expect.poll(() => signals.length).toBeGreaterThan(0);
		await unmount();
		expect(signals.every((signal) => signal.aborted)).toBe(true);
		finish();
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
		expect(container.querySelector('.leaflet-container')).toBeNull();
		expect(navigation.selectedPoi?.id).toBe('poi_hr_1-1');
		expect(errors).not.toHaveBeenCalled();
	});

	it('読み込み前の互換APIの予約を親から解除しても復活させない', async () => {
		let finish!: () => void;
		mockMaps(
			new Promise<void>((resolve) => {
				finish = resolve;
			})
		);
		const navigation = createNavigationState();
		const { component, container } = await render(Map, { props: { navigation } });
		expect(component.highlightPoiById('poi_hr_1-1')).toBe(true);
		expect(navigation.selectedPoi?.id).toBe('poi_hr_1-1');
		navigation.clearHighlight();
		finish();
		await expect.poll(() => container.querySelector('.leaflet-overlay-pane svg')).not.toBeNull();
		expect(navigation.selectedPoi).toBeNull();
		expect(container.querySelector('.poi-highlight')).toBeNull();
	});

	it('経路の階移動マーカーから地図へ通知して、到着階とゴールを表示する', async () => {
		mockMaps();
		const navigation = createNavigationState();
		const { container } = await render(Map, { props: { navigation } });
		await expect.poll(() => container.querySelector('.leaflet-overlay-pane svg')).not.toBeNull();
		navigation.showRoute('node_la_f1_hr_1-1', 'node_la_f2_hr_2m');
		const selector = '.route-transition-entry[title*="2階へ"]';
		await expect.poll(() => container.querySelector(selector)).not.toBeNull();
		container.querySelector<HTMLElement>(selector)!.click();
		await expect.poll(() => container.querySelector('.route-endpoint-goal')).not.toBeNull();
		await expect
			.poll(
				() => container.querySelector('[data-building="la"] button.active')?.textContent?.trim(),
				// 地図移動の1秒間と、その後の階層UIの描画を待ちます。
				{ timeout: 3000 }
			)
			.toBe('2F');
	});
});
