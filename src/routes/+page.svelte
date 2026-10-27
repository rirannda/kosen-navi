<script lang="ts">
	import OMUCTMap from '#lib/components/Map.svelte';
	import RouteSearchPanel from '#lib/components/layout/RouteSearchPanel.svelte';
	import { provideNavigation } from '#lib';
	provideNavigation();
</script>

<OMUCTMap />
