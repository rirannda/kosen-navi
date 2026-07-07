<script lang="ts">
  import BottomNavItem from '../elements/BottomNavItem.svelte';
  let activeTab = $state('home');
</script>

<nav class="fixed">
  <BottomNavItem
    id="home"
    isActive={activeTab === 'home'}
    onclick={() => activeTab = 'home'}
  />
  <BottomNavItem
    id="map"
    isActive={activeTab === 'map'}
    onclick={() => activeTab = 'map'}
  />
</nav>

