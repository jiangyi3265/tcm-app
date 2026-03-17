<script setup>
import { RouterView } from 'vue-router'
</script>

<template>
  <RouterView />
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:root {
  --color-primary: #2d6a4f;
  --color-primary-light: #40916c;
  --color-primary-lighter: #52b788;
  --color-primary-bg: #d8f3dc;
  --color-sidebar-bg: #1b4332;
  --color-sidebar-text: #b7e4c7;
  --color-sidebar-hover: #2d6a4f;
  --color-sidebar-active: #40916c;
  --color-danger: #e63946;
}

body {
  font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif;
  background-color: #f0f2f5;
  color: #333;
}

.el-button--primary {
  --el-button-bg-color: var(--color-primary);
  --el-button-border-color: var(--color-primary);
  --el-button-hover-bg-color: var(--color-primary-light);
  --el-button-hover-border-color: var(--color-primary-light);
}

.el-tag--success {
  --el-tag-bg-color: #d8f3dc;
  --el-tag-border-color: #52b788;
  --el-tag-text-color: #1b4332;
}

::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: #f1f1f1;
}
::-webkit-scrollbar-thumb {
  background: #bbb;
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: #888;
}
</style>
