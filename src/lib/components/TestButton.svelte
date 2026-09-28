<script lang="ts">
	let {
		focusOnPoi,
		showRoute
	}: {
		focusOnPoi: (poiId: string) => void;
		showRoute: (startId: string, goalId: string) => void;
	} = $props();
</script>

<button type="button" onclick={() => focusOnPoi('poi_lr-chem')}>化学講義室へ移動</button>
<button type="button" onclick={() => focusOnPoi('poi_hr_1-1')}>1-1HRへ移動</button>
<button type="button" onclick={() => showRoute('node_la_f1_hr_1-1', 'node_la_f3_lab-a-phys')}>
	1-1HRから応用物理実験室への経路を表示
</button>
