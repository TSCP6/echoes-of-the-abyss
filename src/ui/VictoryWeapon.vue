<script setup lang="ts">
defineProps<{ id: string }>();
</script>
<template>
    <svg viewBox="0 0 48 64" shape-rendering="crispEdges" aria-hidden="true">
        <g v-if="id === 'wpn_shortsword' || id === 'wpn_daggers'">
            <path fill="#dcebf0" d="m22 2 5 8v30H17V10z"/><path fill="#7fa6b8" d="M22 10h5v30h-5z"/>
            <path fill="#dbb269" d="M10 39h24v5H10z"/><path fill="#785b50" d="M19 44h6v15h-6z"/>
            <path v-if="id === 'wpn_daggers'" fill="#dcebf0" d="m36 18 5 6v22H31V24z"/>
        </g>
        <g v-else-if="id === 'wpn_greataxe'">
            <path fill="#87664d" d="M21 10h6v52h-6z"/><path fill="#bacbd0" d="M9 6h27v6h8v20h-8v6H9v-8H4V14h5z"/>
            <path fill="#647f91" d="M19 9h10v26H19z"/><path fill="#f1d2a0" d="M21 8h6v29h-6z"/>
        </g>
        <g v-else-if="id === 'wpn_firestaff'">
            <path fill="#a6794d" d="M21 16h6v47h-6z"/><path fill="#ff9e59" d="m24 0 10 14-10 14-10-14z"/>
            <path fill="#ffe4a0" d="m24 7 4 7-4 7-4-7z"/><path fill="#e0bb77" d="M15 24h18v5H15z"/>
        </g>
        <g v-else-if="id === 'wpn_crossbow'">
            <path fill="#a27d53" d="M20 16h8v46h-8zM7 14h34v6H7zM2 20h7v18H2zM39 20h7v18h-7z"/>
            <path fill="#eadcb2" d="M7 33h34v2H7zM23 4h3v36h-3z"/><path fill="#d4e2e7" d="m24 0 5 7H19z"/>
        </g>
        <g v-else>
            <path fill="#4fa89e" d="M13 9h20v34H13z"/><path fill="#9ad3cb" d="M17 3h12v12H17z"/>
            <path fill="#c8d9d6" d="M9 19h28v5H9zM10 35h27v5H10z"/><path fill="#80624b" d="M19 43h9v17h-9z"/>
        </g>
    </svg>
</template>
