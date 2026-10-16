import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type * as LType from 'leaflet';
import Map from './Map.svelte';
import { baseMapFiles, buildingMaps } from '../../data/maps';

const { maps } = vi.hoisted(() => ({ maps: [] as LType.Map[] }));
vi.mock('leaflet', async (importOriginal) => {
	const L = await importOriginal<typeof LType>();
	return {
		...L,
		map: (...args: Parameters<typeof L.map>) => {
			const map = L.map(...args);
			maps.push(map);
			return map;
		}
	};
});

afterEach(() => {
	vi.restoreAllMocks();
	maps.length = 0;
});

function mockMaps() {
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const file = String(input).split('/').at(-1);
		return new Response(
			`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 1700" data-map="${file}"><path id="${file}_flame" d="M0 0h10v10H0Z" fill="none" stroke="black" /></svg>`,
			{ headers: { 'Content-Type': 'image/svg+xml' } }
		);
	});
}

describe('Map floor maps', () => {
	it('全マップを読み込み、各建物で登録された階だけを切り替えて表示する', async () => {
		const fetchMaps = mockMaps();
		const { container, getByRole } = await render(Map);
		await expect.poll(() => container.querySelector('[data-map="master.svg"]')).not.toBeNull();
		const files = [
			...baseMapFiles,
			...buildingMaps.flatMap((building) => [
				...Object.values(building.floors),
				...(building.overview ? [building.overview] : [])
			])
		];
		expect(fetchMaps.mock.calls.map(([url]) => String(url)).toSorted()).toEqual(
			[...new Set(files)].map((file) => `/maps/${file}`).toSorted()
		);
		const map = maps.at(-1)!;
		for (const building of buildingMaps) {
			const [left, top, right, bottom] = building.bounds;
			map.setView([1700 - (top + bottom) / 2, (left + right) / 2], 2, { animate: false });
			await expect.poll(() => container.querySelector('h3')?.textContent).toBe(building.name);
			const floors = Object.keys(building.floors)
				.map(Number)
				.sort((a, b) => b - a);
			expect(
				container.querySelectorAll(`[data-building="${building.id}"] .floor-buttons button`).length
			).toBe(floors.length);
			const buildingCount = container.querySelectorAll('[data-building]').length;
			expect(buildingCount).toBeGreaterThanOrEqual(1);
			expect(buildingCount).toBeLessThanOrEqual(2);
			for (const floor of floors) {
				await getByRole('region', { name: `${building.name}の階` })
					.getByRole('button', {
						name: floor < 0 ? `B${-floor}` : `${floor}F`,
						exact: true
					})
					.click();
				expect(container.querySelector(`[data-map="${building.floors[floor]}"]`)).not.toBeNull();
				const hasEntrance = !!container.querySelector('[data-building="entrance"]');
				expect(container.querySelectorAll('[data-map]').length).toBe(
					baseMapFiles.length + buildingCount + (hasEntrance ? 0 : 1)
				);
				if (building.overview && building.overview !== building.floors[floor]) {
					expect(container.querySelector(`[data-map="${building.overview}"]`)).toBeNull();
				}
			}
		}
		map.setView([850, 700], -1, { animate: false });
		await expect.poll(() => container.querySelector('.floor-buttons')).toBeNull();
		expect(container.querySelector('[data-map="entrance.svg"]')).not.toBeNull();
		expect(container.querySelector('[data-map="main-gate.svg"]')).not.toBeNull();
		expect(container.querySelectorAll('[data-map]').length).toBe(baseMapFiles.length + 1);
		expect(container.querySelector('.campus-map-shade')).toBeNull();
	});

	it('4階から階数の少ない建物へ移動すると1階を表示する', async () => {
		mockMaps();
		const { container, getByRole } = await render(Map);
		await expect.poll(() => container.querySelector('[data-map="master.svg"]')).not.toBeNull();
		const map = maps.at(-1)!;
		map.setView([817, 780], 2, { animate: false });
		await getByRole('region', { name: '専門棟1の階' })
			.getByRole('button', { name: '4F', exact: true })
			.click();
		expect(container.querySelector('[data-map="ss-bldg_1_F4.svg"]')).not.toBeNull();
		map.setView([616, 867.5], 2, { animate: false });
		await expect.poll(() => container.querySelector('h3')?.textContent).toBe('図書館');
		expect(container.querySelector('.floor-buttons button.active')?.textContent?.trim()).toBe('1F');
		expect(container.querySelector('[data-map="lib_F1.svg"]')).not.toBeNull();
		expect(container.querySelector('[data-map="ss-bldg_1_F4.svg"]')).toBeNull();
	});

	it('教養棟と渡り廊下の外周をパネルと同じ色で強調し、移動しても色と階を維持する', async () => {
		mockMaps();
		const { container, getByRole } = await render(Map);
		await expect.poll(() => container.querySelector('[data-map="master.svg"]')).not.toBeNull();
		const map = maps.at(-1)!;
		map.setView([595, 570], 1, { animate: false });
		await expect.poll(() => container.querySelectorAll('[data-building]').length).toBe(2);
		const la = getByRole('region', { name: '教養棟の階' });
		const skybridge = getByRole('region', { name: '渡り廊下の階' });
		await la.getByRole('button', { name: '3F', exact: true }).click();
		await skybridge.getByRole('button', { name: '2F', exact: true }).click();
		expect(container.querySelector('[data-map="la-bldg_F3.svg"]')).not.toBeNull();
		expect(container.querySelector('[data-map="skybridge_f2.svg"]')).not.toBeNull();
		expect(container.querySelector('[data-map="la-bldg_F1.svg"]')).toBeNull();
		expect(container.querySelector('[data-map="skybridge_f1.svg"]')).toBeNull();
		const outlineColors = ['la-bldg_F3.svg', 'skybridge_f2.svg'].map((file, index) => {
			const outline = container.querySelector(`[data-map="${file}"] .building-floor-outline`)!;
			const panel = container.querySelector(
				`[data-building="${index === 0 ? 'la' : 'skybridge'}"]`
			)!;
			const stroke = getComputedStyle(outline).stroke;
			expect(stroke).toBe(getComputedStyle(panel).borderTopColor);
			expect(getComputedStyle(outline).fill).toBe('none');
			expect(getComputedStyle(outline).pointerEvents).toBe('none');
			expect(getComputedStyle(outline).vectorEffect).toBe('non-scaling-stroke');
			return stroke;
		});
		expect(outlineColors[0]).not.toBe(outlineColors[1]);
		expect(container.querySelectorAll('.building-floor-outline').length).toBe(2);
		map.panBy([10, 0], { animate: false });
		expect(container.querySelector('[data-map="la-bldg_F3.svg"]')).not.toBeNull();
		expect(container.querySelector('[data-map="skybridge_f2.svg"]')).not.toBeNull();
		map.setView([595, 590], 1, { animate: false });
		await expect.poll(() => container.querySelector('h3')?.textContent).toBe('渡り廊下');
		for (const [index, file] of ['la-bldg_F3.svg', 'skybridge_f2.svg'].entries()) {
			const outline = container.querySelector(`[data-map="${file}"] .building-floor-outline`)!;
			expect(getComputedStyle(outline).stroke).toBe(outlineColors[index]);
		}
		expect(container.querySelector('.campus-map-shade')).toBeNull();
		expect(container.querySelector('.floor-map-background')).toBeNull();
		expect(map.getPane('map-shade')).toBeUndefined();
		map.setView([850, 700], -1, { animate: false });
		await expect.poll(() => container.querySelector('.building-controls')).toBeNull();
		expect(container.querySelector('.building-floor-outline')).toBeNull();
		expect(container.querySelector('.campus-map-shade')).toBeNull();
		expect(container.querySelector('.floor-map-background')).toBeNull();
		expect(container.querySelector('[data-map="master.svg"]')).not.toBeNull();
		map.setView([595, 570], 1, { animate: false });
		await expect.poll(() => container.querySelector('[data-map="la-bldg_F3.svg"]')).not.toBeNull();
		expect(container.querySelector('[data-map="skybridge_f2.svg"]')).not.toBeNull();
	});

	it('隣の建物の階を変えても教養棟の経路を消さない', async () => {
		mockMaps();
		const { component, container, getByRole } = await render(Map);
		await expect.poll(() => container.querySelector('[data-map="master.svg"]')).not.toBeNull();
		const map = maps.at(-1)!;
		await new Promise<void>((resolve) => {
			map.once('moveend', () => resolve());
			component.showRoute('node_la_f1_hr_1-1', 'node_la_f1_hr_1-2');
		});
		map.setView([595, 570], 1, { animate: false });
		await getByRole('region', { name: '渡り廊下の階' })
			.getByRole('button', { name: '2F', exact: true })
			.click();
		expect(container.querySelectorAll('.route-endpoint-marker').length).toBe(2);
		expect(container.querySelector('.leaflet-route-lines-pane path')).not.toBeNull();
		expect(container.querySelector('[data-map="la-bldg_F1.svg"]')).not.toBeNull();
		expect(container.querySelector('[data-map="skybridge_f2.svg"]')).not.toBeNull();
	});

	it('2棟表示から中心付近に1棟だけの場所へ移動すると、その棟だけを表示する', async () => {
		mockMaps();
		const { container } = await render(Map);
		await expect.poll(() => container.querySelector('[data-map="master.svg"]')).not.toBeNull();
		const map = maps.at(-1)!;
		map.setView([595, 570], 1, { animate: false });
		await expect.poll(() => container.querySelectorAll('[data-building]').length).toBe(2);
		expect(container.querySelectorAll('.building-floor-outline').length).toBe(2);
		map.setView([616, 867.5], 2, { animate: false });
		await expect.poll(() => container.querySelectorAll('[data-building]').length).toBe(1);
		expect(container.querySelector('[data-building="lib"]')).not.toBeNull();
		expect(container.querySelector('[data-map="lib_F1.svg"]')).not.toBeNull();
		expect(container.querySelectorAll('.building-floor-outline').length).toBe(1);
		expect(container.querySelector('[data-map="la-bldg_F1.svg"]')).toBeNull();
		expect(container.querySelector('[data-map="skybridge_f1.svg"]')).toBeNull();
		map.setView([595, 570], 1, { animate: false });
		await expect.poll(() => container.querySelectorAll('[data-building]').length).toBe(2);
		expect(container.querySelectorAll('.building-floor-outline').length).toBe(2);
		expect(container.querySelector('[data-map="lib_F1.svg"]')).toBeNull();
	});
});
