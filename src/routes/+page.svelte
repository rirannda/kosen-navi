<script lang="ts">
	import OMUCTMap from '#lib/components/Map.svelte';
	import { createNavigationState } from '#lib';
	const navigation = createNavigationState();
</script>

<OMUCTMap {navigation} />
