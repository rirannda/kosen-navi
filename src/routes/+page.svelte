<script lang="ts">
	import OMUCTMap from '#lib/components/Map.svelte';
	import TestButton from '#lib/components/TestButton.svelte';
	import type { HighlightColor, Poi } from '#lib';
	import SearchBar from '#lib/components/layout/SearchBar.svelte';

	type MapController = {
		focusOnPoiId: (poiId: string) => void;
		highlightPoiById: (poiId: string, color?: HighlightColor) => boolean;
		clearPoiHighlight: (color?: HighlightColor) => void;
		showRoute: (startId: string, goalId: string) => string[] | null;
	};

	let mapComponent: MapController | undefined;
	let selectedPoi = $state<Poi | null>(null);

</script>

<OMUCTMap bind:this={mapComponent} bind:selectedPoi />
<!-- この下のpとTestButtonを置き換えて検索などを置く -->
<p aria-live="polite">選択中: {selectedPoi?.name ?? '未選択'}</p>
<TestButton
	focusOnPoi={(poiId) => mapComponent?.focusOnPoiId(poiId)}
	showRoute={(startId, goalId) => mapComponent?.showRoute(startId, goalId)}
	highlightPoi={(poiId, color) => mapComponent?.highlightPoiById(poiId, color)}
	clearPoiHighlight={() => mapComponent?.clearPoiHighlight()}
/>
<SearchBar onselect={(poiId) => mapComponent?.focusOnPoiId(poiId)} large />
