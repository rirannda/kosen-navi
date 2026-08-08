<script lang="ts">
	import { onMount } from 'svelte';
	import 'leaflet/dist/leaflet.css';
	import type * as LType from 'leaflet';

	let mapContainer: HTMLElement;
	let map: LType.Map;

	let showBldgMenu = $state(false);
	let zoomedBldg = $state<'' | 'la' | 'ss1'>('');
	let activeFloor = $state<'F1' | 'F2' | 'F3' | 'F4'>('F1');

	let floorLayers: Record<string, LType.Layer> = {};
	let laBldgFloorLayers: Record<string, LType.Layer> = {};
	let ssBldg1FloorLayers: Record<string, LType.Layer> = {};

	const bldgMenuText = {
		la: { title: '教養棟', floors: 3 },
		ss1: { title: '専門棟1', floors: 4 }
	};

	async function loadSvgOverlay(
		url: string,
		bounds: LType.LatLngBoundsExpression,
		L: typeof LType
	) {
		const response = await fetch(url);
		if (!response.ok) throw new Error(`SVGの取得に失敗しました: ${url}`);
		const svgText = await response.text();
		const parser = new DOMParser();
		const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
		const svgElement = svgDoc.documentElement as unknown as SVGElement;
		return L.svgOverlay(svgElement, bounds, { interactive: true });
	}

	function switchFloor(bldg: string, floor: 'F1' | 'F2' | 'F3' | 'F4') {
		if (!map || activeFloor === floor) return;

		if (floorLayers[activeFloor] && map.hasLayer(floorLayers[activeFloor])) {
			floorLayers[activeFloor].remove();
		}

		activeFloor = floor;

		if (floorLayers[activeFloor]) {
			floorLayers[activeFloor].addTo(map);
		}
	}

	onMount(() => {
		const initMap = async () => {
			const L = await import('leaflet');

			const bounds: LType.LatLngBoundsExpression = [
				[0, 0],
				[1700, 1400]
			];

			map = L.map(mapContainer, {
				crs: L.CRS.Simple,
				minZoom: -1,
				maxZoom: 2,
				zoomControl: true,
				maxBounds: bounds,
				maxBoundsViscosity: 1.0
			});

			const laBldgBounds = L.latLngBounds([
				[672.5, 381],
				[517, 581]
			]);
			const ssBldg1Bounds = L.latLngBounds([
				[864, 627],
				[770.5, 921]
			]);
			const SHOW_UI_ZOOM_THRESHOLD = 1;

			try {
				// svgを並列読み込み
				const [
					masterLayer,
					laBldgF1Layer,
					laBldgF2Layer,
					laBldgF3Layer,
					ssBldg1F1Layer,
					ssBldg1F2Layer,
					ssBldg1F3Layer,
					ssBldg1F4Layer
				] = await Promise.all([
					loadSvgOverlay('/maps/master.svg', bounds, L),
					loadSvgOverlay('/maps/la-bldg_F1.svg', bounds, L),
					loadSvgOverlay('/maps/la-bldg_F2.svg', bounds, L), // placeholder
					loadSvgOverlay('/maps/la-bldg_F3.svg', bounds, L), // placeholder
					loadSvgOverlay('/maps/ss-bldg_1_F1.svg', bounds, L),
					loadSvgOverlay('/maps/ss-bldg_1_F2.svg', bounds, L),
					loadSvgOverlay('/maps/ss-bldg_1_F3.svg', bounds, L),
					loadSvgOverlay('/maps/ss-bldg_1_F4.svg', bounds, L)
				]);

				masterLayer.addTo(map);

				// 位置確認用マーカー
				let marker = L.marker([864, 627]);
				marker.addTo(map);
				marker = L.marker([864, 921]);
				marker.addTo(map);
				marker = L.marker([770.5, 627]);
				marker.addTo(map);
				marker = L.marker([770.5, 921]);
				marker.addTo(map);
				marker = L.marker([553, 581]);
				marker.addTo(map);

				laBldgFloorLayers['F1'] = laBldgF1Layer;
				laBldgFloorLayers['F2'] = laBldgF2Layer;
				laBldgFloorLayers['F3'] = laBldgF3Layer;
				ssBldg1FloorLayers['F1'] = ssBldg1F1Layer;
				ssBldg1FloorLayers['F2'] = ssBldg1F2Layer;
				ssBldg1FloorLayers['F3'] = ssBldg1F3Layer;
				ssBldg1FloorLayers['F4'] = ssBldg1F4Layer;

				const updateMapState = () => {
					const currentZoom = map.getZoom();
					const mapCenter = map.getCenter();

					const isZoomedIn = currentZoom >= SHOW_UI_ZOOM_THRESHOLD;

					// 画面の中心が建物の領域内にあるか判定
					// 建物のBoundsを20%拡張した範囲を中心に設定
					const isLaBldgInCenter = laBldgBounds.pad(0.2).contains(mapCenter);
					const isSsBldg1InCenter = ssBldg1Bounds.pad(0.2).contains(mapCenter);

					if (isZoomedIn && isLaBldgInCenter) {
						zoomedBldg = 'la';
						if (floorLayers['F1'] && map.hasLayer(floorLayers['F1'])) floorLayers['F1'].remove();
						if (floorLayers['F2'] && map.hasLayer(floorLayers['F2'])) floorLayers['F2'].remove();
						if (floorLayers['F3'] && map.hasLayer(floorLayers['F3'])) floorLayers['F3'].remove();
						if (floorLayers['F4'] && map.hasLayer(floorLayers['F4'])) floorLayers['F4'].remove();
						floorLayers = laBldgFloorLayers;
					} else if (isZoomedIn && isSsBldg1InCenter) {
						zoomedBldg = 'ss1';
						if (floorLayers['F1'] && map.hasLayer(floorLayers['F1'])) floorLayers['F1'].remove();
						if (floorLayers['F2'] && map.hasLayer(floorLayers['F2'])) floorLayers['F2'].remove();
						if (floorLayers['F3'] && map.hasLayer(floorLayers['F3'])) floorLayers['F3'].remove();
						if (floorLayers['F4'] && map.hasLayer(floorLayers['F4'])) floorLayers['F4'].remove();
						floorLayers = ssBldg1FloorLayers;
					} else {
						zoomedBldg = '';
					}
					showBldgMenu = isZoomedIn && zoomedBldg != '';

					if (showBldgMenu) {
						if (floorLayers[activeFloor] && !map.hasLayer(floorLayers[activeFloor])) {
							floorLayers[activeFloor].addTo(map);
						}
					} else {
						if (floorLayers['F1'] && map.hasLayer(floorLayers['F1'])) floorLayers['F1'].remove();
						if (floorLayers['F2'] && map.hasLayer(floorLayers['F2'])) floorLayers['F2'].remove();
						if (floorLayers['F3'] && map.hasLayer(floorLayers['F3'])) floorLayers['F3'].remove();
						if (floorLayers['F4'] && map.hasLayer(floorLayers['F4'])) floorLayers['F4'].remove();
					}
				};

				map.on('zoomend moveend', updateMapState);
				map.fitBounds(bounds);
				updateMapState();
			} catch (error) {
				console.error('マップの初期化エラー:', error);
			}
		};

		initMap();

		return () => {
			if (map) map.remove();
		};
	});
</script>

<div class="map-wrapper">
	<div bind:this={mapContainer} class="map-container"></div>

	{#if showBldgMenu && zoomedBldg != ''}
		<div class="custom-control-panel">
			<h3>{bldgMenuText[zoomedBldg].title}</h3>
			<div class="floor-buttons">
				{#if bldgMenuText[zoomedBldg].floors == 4}
					<button class:active={activeFloor === 'F4'} onclick={() => switchFloor(zoomedBldg, 'F4')}>
						4F
					</button>
					<button class:active={activeFloor === 'F3'} onclick={() => switchFloor(zoomedBldg, 'F3')}>
						3F
					</button>
				{/if}
				{#if bldgMenuText[zoomedBldg].floors == 3}
					<button class:active={activeFloor === 'F3'} onclick={() => switchFloor(zoomedBldg, 'F3')}>
						3F
					</button>
				{/if}
				<button class:active={activeFloor === 'F2'} onclick={() => switchFloor(zoomedBldg, 'F2')}>
					2F
				</button>
				<button class:active={activeFloor === 'F1'} onclick={() => switchFloor(zoomedBldg, 'F1')}>
					1F
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.map-wrapper {
		position: relative;
		width: 100%;
		height: 600px;
		border-radius: 8px;
		overflow: hidden;
	}

	.map-container {
		width: 100%;
		height: 100%;
		background-color: #f0f0f0;
		z-index: 1;
	}

	.custom-control-panel {
		position: absolute;
		top: 20px;
		right: 20px;
		z-index: 1000;
		background: rgba(255, 255, 255, 0.95);
		padding: 16px;
		border-radius: 12px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		backdrop-filter: blur(4px);
		transition: opacity 0.3s ease;
	}

	.custom-control-panel h3 {
		margin: 0 0 12px 0;
		font-size: 14px;
		color: #333;
		text-align: center;
	}

	.floor-buttons {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.floor-buttons button {
		padding: 8px 24px;
		border: 1px solid #ccc;
		background: white;
		border-radius: 6px;
		cursor: pointer;
		font-weight: bold;
		transition: all 0.2s;
	}

	.floor-buttons button:hover {
		background: #f8f9fa;
	}

	.floor-buttons button.active {
		background: #007bff;
		color: white;
		border-color: #007bff;
	}
</style>
