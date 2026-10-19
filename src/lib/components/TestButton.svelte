<script lang="ts">
	import type { HighlightColor } from '$lib';
	let {
		focusOnPoi,
		showRoute,
		highlightPoi,
		clearPoiHighlight
	}: {
		focusOnPoi: (poiId: string) => void;
		showRoute: (startId: string, goalId: string) => void;
		highlightPoi: (poiId: string, color?: HighlightColor) => void;
		clearPoiHighlight: () => void;
	} = $props();
	function navigate() {
		showRoute('node_la_f1_hr_1-1', 'node_la_f3_lab-a-phys');
		highlightPoi('poi_hr_1-1', 'start');
		highlightPoi('poi_lab-a-phys', 'goal');
		focusOnPoi('poi_hr_1-1');
	}
</script>

<div class="test-controls">
	<button type="button" onclick={() => focusOnPoi('poi_lr-chem')}>化学講義室へ移動</button>
	<button type="button" onclick={() => focusOnPoi('poi_hr_1-1')}>1-1HRへ移動</button>
	<button type="button" onclick={() => navigate()}> 1-1HRから応用物理実験室への経路を表示 </button>
	<button type="button" onclick={() => highlightPoi('poi_hr_1-1', 'start')}>
		1-1HRをスタート色でハイライト
	</button>
	<button type="button" onclick={() => highlightPoi('poi_lab-a-phys', 'goal')}>
		応用物理実験室をゴール色でハイライト
	</button>
	<button type="button" onclick={() => highlightPoi('poi_lr-chem', 'selected')}>
		化学講義室を選択色でハイライト
	</button>
	<button type="button" onclick={clearPoiHighlight}>POIハイライトを解除</button>
</div>

<style>
	.test-controls {
		padding-bottom: 80px;
	}

	button {
		margin-top: 4px;
		padding: 4px;
		border: solid 1px black;
	}
</style>
