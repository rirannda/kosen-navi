import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type * as LType from 'leaflet';
import Map from '../Map.svelte';
import { baseMapFiles, buildingMaps } from '../../../data/maps';
import { MAX_FLOOR_CONTROL_LINE_LENGTH } from '../../map/floorControlLayout';

const MAX_FOCUSED_BUILDINGS = 6;

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

beforeEach(async () => {
	await page.viewport(1280, 900);
});

afterEach(() => {
	vi.restoreAllMocks();
	maps.length = 0;
});

function mockMaps(outlines: Record<string, string> = {}) {
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const file = String(input).split('/').at(-1)!;
		const building = buildingMaps.find((building) => Object.values(building.floors).includes(file));
		const [left, top, right, bottom] = building?.bounds ?? [0, 0, 10, 10];
		return new Response(
			`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 1700" data-map="${file}"><path id="${file}_flame" d="${outlines[building?.id ?? ''] ?? `M${left} ${top}H${right}V${bottom}H${left}Z`}" fill="none" stroke="black" /></svg>`,
			{ headers: { 'Content-Type': 'image/svg+xml' } }
		);
	});
}

async function renderFloorMap() {
	const rendered = await render(Map);
	await expect
		.poll(() => rendered.container.querySelector('[data-map="master.svg"]'))
		.not.toBeNull();
	maps.at(-1)!.setView([555, 700], 0, { animate: false });
	return rendered;
}

function panelsFit(container: HTMLElement): boolean {
	const viewport = container.querySelector('.map-container')!.getBoundingClientRect();
	const panels = Array.from(container.querySelectorAll('[data-building]'));
	if (!panels.length) return false;
	const bounds = panels.map((panel) => panel.getBoundingClientRect());
	return bounds.every(
		(rect, index) =>
			rect.width > 0 &&
			rect.height > 0 &&
			rect.left >= viewport.left &&
			rect.right <= viewport.right &&
			rect.top >= viewport.top &&
			rect.bottom <= viewport.bottom &&
			bounds
				.slice(0, index)
				.every(
					(other) =>
						rect.right <= other.left ||
						rect.left >= other.right ||
						rect.bottom <= other.top ||
						rect.top >= other.bottom
				)
	);
}

describe('Map floor maps', () => {
	it('ズームしないと階別図・UI・接続線を出さず、再ズーム時に選択した階を復元する', async () => {
		mockMaps();
		const { container, getByRole } = await render(Map);
		await expect.poll(() => container.querySelector('[data-map="master.svg"]')).not.toBeNull();
		expect(container.querySelector('.building-controls')).toBeNull();
		expect(container.querySelector('.building-floor-outline')).toBeNull();
		expect(container.querySelector('[data-connector]')).toBeNull();
		expect(container.querySelector('[data-map="entrance.svg"]')).not.toBeNull();
		const map = maps.at(-1)!;
		map.setView([555, 700], 0, { animate: false });
		await expect
			.poll(() => container.querySelectorAll('[data-building]').length)
			.toBe(MAX_FOCUSED_BUILDINGS);
		map.setView([315, 850], 2, { animate: false });
		await getByRole('region', { name: '体育館の階' })
			.getByRole('button', { name: '2F', exact: true })
			.click();
		await expect.poll(() => container.querySelector('[data-connector="gym"]')).not.toBeNull();
		map.setView([555, 700], -1, { animate: false });
		await expect.poll(() => container.querySelector('.building-controls')).toBeNull();
		expect(container.querySelector('.building-floor-outline')).toBeNull();
		expect(container.querySelector('[data-map="gym_F2.svg"]')).toBeNull();
		expect(container.querySelector('[data-connector]')).toBeNull();
		expect(container.querySelector('[data-map="entrance.svg"]')).not.toBeNull();
		map.setView([315, 850], 2, { animate: false });
		await expect.poll(() => container.querySelector('[data-map="gym_F2.svg"]')).not.toBeNull();
		expect(
			container.querySelector('[data-building="gym"] button.active')?.textContent?.trim()
		).toBe('2F');
	});

	it('最大6棟の階別図を表示し、各棟の公開階を切り替えられる', async () => {
		const fetchMaps = mockMaps();
		const { container, getByRole } = await renderFloorMap();
		await expect
			.poll(() => container.querySelectorAll('[data-building]').length)
			.toBe(MAX_FOCUSED_BUILDINGS);
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
			await expect
				.poll(() =>
					Object.values(building.floors).some((file) =>
						container.querySelector(`[data-map="${file}"]`)
					)
				)
				.toBe(true);
			if (Object.keys(building.floors).length === 1) {
				expect(container.querySelector(`[data-building="${building.id}"]`)).toBeNull();
				expect(container.querySelector(`[data-connector="${building.id}"]`)).toBeNull();
				expect(
					container.querySelector(`[data-map="${Object.values(building.floors)[0]}"]`)
				).not.toBeNull();
				continue;
			}
			const panel = getByRole('region', { name: `${building.name}の階` });
			const floors = Object.keys(building.floors)
				.map(Number)
				.sort((a, b) => b - a);
			expect(container.querySelectorAll(`[data-building="${building.id}"] button`).length).toBe(
				floors.length
			);
			for (const floor of floors) {
				await panel
					.getByRole('button', { name: floor < 0 ? `B${-floor}` : `${floor}F`, exact: true })
					.click();
				expect(container.querySelector(`[data-map="${building.floors[floor]}"]`)).not.toBeNull();
				expect(
					container.querySelectorAll('.leaflet-floor-maps-pane > svg').length
				).toBeLessThanOrEqual(MAX_FOCUSED_BUILDINGS);
				expect(container.querySelectorAll('[data-building]').length).toBeLessThanOrEqual(
					MAX_FOCUSED_BUILDINGS
				);
				if (building.overview && building.overview !== building.floors[floor]) {
					expect(container.querySelector(`[data-map="${building.overview}"]`)).toBeNull();
				}
			}
		}
		expect(container.querySelector('.campus-map-shade')).toBeNull();
	});

	it('1階しかない建物だけが見える場所でも階別図は表示し、UIと接続線は表示しない', async () => {
		mockMaps();
		const { container } = await renderFloorMap();
		const map = maps.at(-1)!;
		container.querySelector<HTMLElement>('.map-wrapper')!.style.width = '300px';
		container.querySelector<HTMLElement>('.map-wrapper')!.style.height = '600px';
		map.invalidateSize({ animate: false, pan: false });
		map.setView([314, 1050], 2, { animate: false });
		await expect.poll(() => container.querySelector('[data-map="mah.svg"]')).not.toBeNull();
		await expect.poll(() => container.querySelector('.building-controls')).toBeNull();
		expect(container.querySelector('[data-connector="mah"]')).toBeNull();
		expect(container.querySelector('[data-map="mah.svg"] .building-floor-outline')).not.toBeNull();
	});

	it.each(['left', 'right', 'top', 'bottom'] as const)(
		'画面の%s端48pxにしか見えない建物は階別図・UI・接続線を隠す',
		async (side) => {
			mockMaps();
			const { container } = await renderFloorMap();
			const map = maps.at(-1)!;
			map.setMaxBounds([
				[-10000, -10000],
				[10000, 10000]
			]);
			const wrapper = container.querySelector<HTMLElement>('.map-wrapper')!;
			wrapper.style.width = '200px';
			wrapper.style.height = '200px';
			map.invalidateSize({ animate: false, pan: false });
			for (const zoom of [0, 1, 2]) {
				for (const visiblePixels of [47, 48, 49]) {
					const scale = 2 ** zoom;
					const width = map.getSize().x;
					const height = map.getSize().y;
					const lat =
						side === 'top'
							? 552 - (height / 2 - visiblePixels) / scale
							: side === 'bottom'
								? 680 + (height / 2 - visiblePixels) / scale
								: 616;
					const lng =
						side === 'left'
							? 921 + (width / 2 - visiblePixels) / scale
							: side === 'right'
								? 814 - (width / 2 - visiblePixels) / scale
								: 867.5;
					map.setView([lat, lng], zoom, { animate: false });
					if (visiblePixels <= 48) {
						await expect.poll(() => container.querySelector('[data-map="lib_F1.svg"]')).toBeNull();
						expect(container.querySelector('[data-building="lib"]')).toBeNull();
						await expect.poll(() => container.querySelector('[data-connector="lib"]')).toBeNull();
					} else {
						await expect
							.poll(() => container.querySelector('[data-map="lib_F1.svg"]'))
							.not.toBeNull();
						expect(container.querySelector('[data-building="lib"]')).not.toBeNull();
						await expect
							.poll(() => container.querySelector('[data-connector="lib"]'))
							.not.toBeNull();
					}
				}
			}
		}
	);

	it('画面幅が余白の2倍以下なら階別表示をせず、広げると復帰する', async () => {
		mockMaps();
		const { container } = await renderFloorMap();
		const map = maps.at(-1)!;
		const wrapper = container.querySelector<HTMLElement>('.map-wrapper')!;
		wrapper.style.width = '96px';
		map.invalidateSize({ animate: false, pan: false });
		await expect.poll(() => container.querySelector('.building-controls')).toBeNull();
		expect(container.querySelector('.building-floor-outline')).toBeNull();
		wrapper.style.width = '1280px';
		map.invalidateSize({ animate: false, pan: false });
		map.setView([555, 700], 0, { animate: false });
		await expect
			.poll(() => container.querySelectorAll('[data-building]').length)
			.toBe(MAX_FOCUSED_BUILDINGS);
	});

	it('画面内の建物だけを表示し、移動で外れたUI・階別図・接続線を取り除く', async () => {
		mockMaps();
		const { container } = await renderFloorMap();
		await expect
			.poll(() => container.querySelectorAll('[data-building]').length)
			.toBe(MAX_FOCUSED_BUILDINGS);
		const map = maps.at(-1)!;
		container.querySelector<HTMLElement>('.map-wrapper')!.style.height = '600px';
		map.invalidateSize({ animate: false, pan: false });
		map.setView([616, 867.5], 2, { animate: false });
		await expect.poll(() => container.querySelectorAll('[data-building]').length).toBe(1);
		expect(container.querySelector('[data-building="lib"]')).not.toBeNull();
		expect(container.querySelector('[data-map="lib_F1.svg"]')).not.toBeNull();
		expect(container.querySelector('[data-map="la-bldg_F1.svg"]')).toBeNull();
		await expect.poll(() => container.querySelectorAll('[data-connector]').length).toBe(1);
		map.setView([1550, 160], 2, { animate: false });
		await expect.poll(() => container.querySelector('.building-controls')).toBeNull();
		expect(container.querySelector('.building-floor-outline')).toBeNull();
		expect(container.querySelector('[data-map="master.svg"]')).not.toBeNull();
		expect(container.querySelector('[data-map="entrance.svg"]')).not.toBeNull();
		container.querySelector<HTMLElement>('.map-wrapper')!.style.height = '900px';
		map.invalidateSize({ animate: false, pan: false });
		map.setView([555, 700], 0, { animate: false });
		await expect
			.poll(() => container.querySelectorAll('[data-building]').length)
			.toBe(MAX_FOCUSED_BUILDINGS);
	});

	it('建物に対応する色の線でUIを結び、画面内で重ねず移動・幅の変更にも追従する', async () => {
		mockMaps();
		const { container } = await renderFloorMap();
		await expect
			.poll(() => container.querySelectorAll('[data-connector]').length)
			.toBe(MAX_FOCUSED_BUILDINGS);
		await expect.poll(() => panelsFit(container)).toBe(true);
		const map = maps.at(-1)!;
		const colors = Array.from(container.querySelectorAll<HTMLElement>('[data-building]')).map(
			(panel) => {
				const id = panel.dataset.building!;
				const connector = container.querySelector(`[data-connector="${id}"]`)!;
				const color = getComputedStyle(panel).borderTopColor;
				expect(getComputedStyle(connector).stroke).toBe(color);
				return color;
			}
		);
		expect(new Set(colors).size).toBe(MAX_FOCUSED_BUILDINGS);
		const line = container.querySelector<SVGLineElement>('[data-connector="la"]')!;
		const originalX = line.x1.baseVal.value;
		map.panBy([20, 0], { animate: false });
		await expect.poll(() => line.x1.baseVal.value).not.toBe(originalX);
		expect(line.x1.baseVal.value).toBeCloseTo(originalX - 20, 0);
		container.querySelector<HTMLElement>('.map-wrapper')!.style.width = '390px';
		map.invalidateSize({ animate: false, pan: false });
		await expect.poll(() => panelsFit(container)).toBe(true);
		expect(container.querySelector('.campus-map-shade')).toBeNull();
		expect(container.querySelector('.floor-map-background')).toBeNull();
		// 線の上からでも地図を操作できるよう、UIの空白部分は操作を遮りません。
		expect(getComputedStyle(container.querySelector('.building-controls')!).pointerEvents).toBe(
			'none'
		);
	});

	it('実際の輪郭へ結ぶ線の上限を移動・ズーム・画面幅の変更後も守る', async () => {
		mockMaps({
			skybridge: 'M614.5 929.5V1230.5H674.5V1263.5H664.5V1243.5H614.5V1276.5H589.5V929.5Z',
			cafe: 'M832.5 1272H757.5V1244.5H748V1195H832.5Z',
			lib: 'M814 1020H921V1148H826V1047H814Z'
		});
		const { container } = await renderFloorMap();
		const map = maps.at(-1)!;
		const wrapper = container.querySelector<HTMLElement>('.map-wrapper')!;
		for (const { width, zoom, center, expectedId } of [
			{ width: 414, zoom: 0, center: [619, 743], expectedId: 'lib' },
			{ width: 390, zoom: 1, center: [595, 620], expectedId: 'la' },
			{ width: 390, zoom: 2, center: [315, 850], expectedId: 'gym' },
			{ width: 1280, zoom: 0, center: [555, 700], expectedId: 'cafe' }
		]) {
			wrapper.style.width = `${width}px`;
			wrapper.style.height = '770px';
			map.invalidateSize({ animate: false, pan: false });
			map.setView([center[0], center[1]], zoom, { animate: false });
			await expect
				.poll(() => container.querySelector(`[data-connector="${expectedId}"]`))
				.not.toBeNull();
			await expect
				.poll(() => {
					const lines = Array.from(container.querySelectorAll<SVGLineElement>('[data-connector]'));
					return (
						lines.length > 0 &&
						lines.every(
							(line) =>
								Math.hypot(
									line.x1.baseVal.value - line.x2.baseVal.value,
									line.y1.baseVal.value - line.y2.baseVal.value
								) <= MAX_FLOOR_CONTROL_LINE_LENGTH
						)
					);
				})
				.toBe(true);
			const viewport = container.querySelector('.map-container')!.getBoundingClientRect();
			for (const line of container.querySelectorAll<SVGLineElement>('[data-connector]')) {
				const building = buildingMaps.find(({ id }) => id === line.dataset.connector)!;
				const svg = Array.from(
					container.querySelectorAll<SVGSVGElement>('.leaflet-floor-maps-pane svg')
				).find((svg) => Object.values(building.floors).includes(svg.dataset.map!))!;
				const outline = svg.querySelector<SVGGeometryElement>('[id$="_flame"]')!;
				const point = new DOMPoint(
					viewport.left + line.x1.baseVal.value,
					viewport.top + line.y1.baseVal.value
				).matrixTransform(outline.getScreenCTM()!.inverse());
				expect(outline.isPointInStroke(point)).toBe(true);
			}
		}
	});

	it('3棟以上の接続を辿って階を合わせ、接続のない階や別棟の選択は維持する', async () => {
		mockMaps();
		const { container, getByRole } = await renderFloorMap();
		await expect
			.poll(() => container.querySelectorAll('[data-building]').length)
			.toBe(MAX_FOCUSED_BUILDINGS);
		const map = maps.at(-1)!;
		container.querySelector<HTMLElement>('.map-wrapper')!.style.width = '1000px';
		map.invalidateSize({ animate: false, pan: false });
		map.setView([817, 603], 0, { animate: false });
		await expect.poll(() => container.querySelector('[data-building="ss2"]')).not.toBeNull();
		const skybridge = getByRole('region', { name: '渡り廊下の階' });
		await skybridge.getByRole('button', { name: '2F', exact: true }).click();
		for (const id of ['la', 'ss1', 'ss2', 'staircase', 'cepc']) {
			expect(
				container.querySelector(`[data-building="${id}"] button.active`)?.textContent?.trim()
			).toBe('2F');
		}
		expect(container.querySelector('[data-building="gym"]')).toBeNull();
		await getByRole('region', { name: '教養棟の階' })
			.getByRole('button', { name: '3F', exact: true })
			.click();
		expect(
			container.querySelector('[data-building="skybridge"] button.active')?.textContent?.trim()
		).toBe('2F');
		await skybridge.getByRole('button', { name: '1F', exact: true }).click();
		expect(container.querySelector('[data-map="la-bldg_F1.svg"]')).not.toBeNull();
		map.setView([399.75, 664], 1, { animate: false });
		await getByRole('region', { name: 'エントランスの階' })
			.getByRole('button', { name: '0F', exact: true })
			.click();
		expect(container.querySelector('[data-map="entrance.svg"]')).not.toBeNull();
		expect(
			container.querySelector('[data-building="skybridge"] button.active')?.textContent?.trim()
		).toBe('1F');
	});

	it('表示範囲を出入りしても各棟の階と色を維持する', async () => {
		mockMaps();
		const { container, getByRole } = await renderFloorMap();
		await expect
			.poll(() => container.querySelectorAll('[data-building]').length)
			.toBe(MAX_FOCUSED_BUILDINGS);
		const map = maps.at(-1)!;
		map.setView([315, 850], 2, { animate: false });
		await getByRole('region', { name: '体育館の階' })
			.getByRole('button', { name: '2F', exact: true })
			.click();
		const color = getComputedStyle(
			container.querySelector('[data-building="gym"]')!
		).borderTopColor;
		map.setView([616, 867.5], 2, { animate: false });
		await expect.poll(() => container.querySelector('[data-building="gym"]')).toBeNull();
		map.setView([315, 850], 2, { animate: false });
		await expect.poll(() => container.querySelector('[data-building="gym"]')).not.toBeNull();
		expect(container.querySelector('[data-map="gym_F2.svg"]')).not.toBeNull();
		expect(getComputedStyle(container.querySelector('[data-building="gym"]')!).borderTopColor).toBe(
			color
		);
	});

	it('複数棟表示で選択した階に合わせ、経路と始点・終点も切り替える', async () => {
		mockMaps();
		const { component, container, getByRole } = await renderFloorMap();
		await expect
			.poll(() => container.querySelectorAll('[data-building]').length)
			.toBe(MAX_FOCUSED_BUILDINGS);
		component.showRoute('node_la_f1_hr_1-1', 'node_la_f2_hr_2m');
		await getByRole('region', { name: '渡り廊下の階' })
			.getByRole('button', { name: '2F', exact: true })
			.click();
		expect(container.querySelector('.route-endpoint-start')).toBeNull();
		expect(container.querySelector('.route-endpoint-goal')).not.toBeNull();
		expect(container.querySelector('.leaflet-route-lines-pane path')).not.toBeNull();
		expect(container.querySelector('[data-map="la-bldg_F2.svg"]')).not.toBeNull();
	});

	it('屋外の経路と正門マークは建物の階を変えても表示する', async () => {
		mockMaps();
		const { component, container, getByRole } = await renderFloorMap();
		await expect
			.poll(() => container.querySelectorAll('[data-building]').length)
			.toBe(MAX_FOCUSED_BUILDINGS);
		const map = maps.at(-1)!;
		await new Promise<void>((resolve) => {
			map.once('moveend', () => resolve());
			component.showRoute('node_outdoor_f0_main-gate', 'node_la_f1_hr_1-1');
		});
		map.setView([315, 850], 2, { animate: false });
		await expect.poll(() => container.querySelector('[data-building="gym"]')).not.toBeNull();
		await getByRole('region', { name: '体育館の階' })
			.getByRole('button', { name: '2F', exact: true })
			.click();
		expect(container.querySelector('.route-endpoint-start')).not.toBeNull();
	});

	it('近い地点の案内・始点・終点の吹き出しを重ねず、ズームや幅の変更後も配置する', async () => {
		mockMaps();
		const { component, container } = await renderFloorMap();
		await expect.poll(() => container.querySelector('[data-map="master.svg"]')).not.toBeNull();
		const map = maps.at(-1)!;
		await new Promise<void>((resolve) => {
			map.once('moveend', () => resolve());
			component.showRoute('node_la_f1_entrance', 'node_skybridge_f1_ee_la-south');
		});
		const fitsWithoutOverlap = () => {
			const labels = Array.from(
				container.querySelectorAll('.route-transition-label, .route-endpoint-label')
			);
			if (labels.length !== 3) return false;
			const viewport = container.querySelector('.map-container')!.getBoundingClientRect();
			const bounds = labels.map((element) => element.getBoundingClientRect());
			return bounds.every(
				(rect, index) =>
					rect.width > 0 &&
					rect.left >= viewport.left &&
					rect.right <= viewport.right &&
					rect.top >= viewport.top &&
					rect.bottom <= viewport.bottom &&
					bounds
						.slice(0, index)
						.every(
							(other) =>
								rect.right <= other.left ||
								rect.left >= other.right ||
								rect.bottom <= other.top ||
								rect.top >= other.bottom
						)
			);
		};
		await expect.poll(fitsWithoutOverlap).toBe(true);
		expect(container.querySelector('.route-label-connector')).not.toBeNull();
		map.setZoom(0, { animate: false });
		await expect.poll(fitsWithoutOverlap).toBe(true);
		container.querySelector<HTMLElement>('.map-wrapper')!.style.width = '320px';
		map.invalidateSize({ animate: false });
		await expect.poll(fitsWithoutOverlap).toBe(true);
		component.clearRoute();
		expect(container.querySelector('.route-label-connector')).toBeNull();
		await expect
			.poll(() => container.querySelector('.route-transition-label, .route-endpoint-label'))
			.toBeNull();
	});
});
