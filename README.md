# TCM Clinic Management System - App

中医诊所综合管理系统 — 用户端前端

## 项目简介

中医诊所综合管理系统的用户端前端应用，基于 **Vue 3 + Vite + Element Plus** 构建，提供患者预约挂号、问诊记录查看、中药方剂浏览、穴位查询、个人中心等功能界面，支持中英文国际化。

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Vue 3 (Composition API) |
| 构建 | Vite 7 |
| UI 库 | Element Plus |
| 状态管理 | Pinia |
| 路由 | Vue Router 5 |
| 国际化 | vue-i18n |
| 工具库 | Day.js、UUID |
| Node | >= 20.19.0 或 >= 22.12.0 |

## 关联仓库

| 仓库 | 说明 | 链接 |
|------|------|------|
| **tcm-backend** | 后端服务（Spring Boot + MyBatis） | [tcm-backend](https://github.com/jiangyi3265/tcm-backend) |
| **tcm-app** | 用户端前端（当前仓库） | — |

## 快速启动

```bash
# 1. 克隆项目
git clone https://github.com/jiangyi3265/tcm-app.git
cd tcm-app

# 2. 安装依赖
npm install

# 3. 启动开发服务器（仅前端）
npm run dev

# 4. 或同时启动前后端（需本地配置 Maven）
npm run dev:full

# 5. 构建生产包
npm run build
```

开发服务器默认端口参见 `vite.config.js`。

## 简历描述

> **中医诊所综合管理系统（用户端）** — 基于 Vue 3 + Vite + Element Plus + Pinia 的中医诊所管理平台用户端，实现患者在线预约挂号、问诊病历查看、中药方剂与针灸穴位浏览、多语言切换（vue-i18n）等功能，采用 Composition API 与模块化路由设计，对接后端 RESTful API。
