<script lang="ts">
	import Map from '$lib/components/Map.svelte';
	import TestButton from '$lib/components/TestButton.svelte';

	type MapController = {
		focusOnPoiId: (poiId: string) => void;
		showRoute: (startId: string, goalId: string) => string[] | null;
	};

	let mapComponent: MapController | undefined;
</script>

<h1>Welcome to SvelteKit</h1>
<p>Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the documentation</p>
<Map bind:this={mapComponent} />
<TestButton
	focusOnPoi={(poiId) => mapComponent?.focusOnPoiId(poiId)}
	showRoute={(startId, goalId) => mapComponent?.showRoute(startId, goalId)}
/>
