<script lang="ts">
	let { focusOnPoi }: { focusOnPoi: (poiId: string) => void } = $props();
</script>

<button type="button" onclick={() => focusOnPoi('poi_lr-chem')}>化学講義室へ移動</button>
<button type="button" onclick={() => focusOnPoi('poi_hr_1-1')}>1-1HRへ移動</button>
