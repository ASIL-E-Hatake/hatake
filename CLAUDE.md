# Enterprise UI Framework

## Project Overview

Enterprise UI Framework は、Flutter を利用した業務システム開発を効率化するための宣言型 UI Framework である。

本プロジェクトは Widget ライブラリではない。

Business Application を UI コードではなく「定義(Definition)」によって構築することを目的とする。

Flutter は Renderer の一つに過ぎず、Framework の中心ではない。

Framework の中心は DSL と Business Definition である。

---

# 作業境界（フレームワーク / サイト）

サイト（GitHub Pages）とフレームワークは別のチャットで進める。契約は docs/site/protocol.ja.md（正はこの1枚）。

・フレームワーク側は site/ を編集しない。サイトへの申し送りは docs/site/topics.json への追記1件だけ。

・サイト側は flutter/ java/ typescript/ spec/ と docs/site/topics.json を編集しない。

・同じ PR で両方を変更すると CI が落ちる。

役割を明示して始めるときは /framework または /site を使う。

---

# Vision

業務システムはどの会社でも似ている。

検索画面

一覧画面

CRUD

入力フォーム

ダッシュボード

詳細画面

マスタメンテ

これらを毎回 Flutter で実装するのではなく、
Business Definition を記述するだけで生成できる世界を目指す。

---

# Mission

Business First

UI を作るのではなく、業務を記述する。

Configuration over Coding

Widget を書くのではなく Definition を書く。

Backend Agnostic

Spring Boot

ASP.NET

Node

Laravel

Firebase

Supabase

どの Backend にも依存しない。

Renderer Independent

Material

Fluent

Cupertino

独自 Theme

Renderer は交換可能である。

AI First

人間だけではなく AI が理解・生成しやすい Framework を目指す。

---

# Core Architecture

Definition

↓

Parser

↓

PageDefinition

↓

Renderer

↓

Flutter Widget

PageDefinition を Single Source of Truth とする。

Renderer は Definition を描画する責務のみを持つ。

Business Logic は持たない。

---

# Design Principles

Business Component > UI Component

Definition > Widget

Configuration > Programming

Composition > Inheritance

Convention > Customization

Plugin > Fork

Schema > Source Code

Extensibility > Simplicity

AI Friendly API

Backend Agnostic

---

# Scope

Framework が提供するもの

・画面生成

・Layout

・Form

・Table

・Search

・CRUD

・Validation

・Navigation

・Theme

・Plugin

・Renderer

Framework が提供しないもの

Business Logic

Workflow Engine

Database

Authentication

Authorization

Backend API

ORM

---

# Business Components

Framework は以下のような Business Component を提供する。

SearchPage

CrudPage

MasterPage

DetailPage

DashboardPage

FormPage

WizardPage

Dialog

Table

Card

Filter

Pagination

Toolbar

ActionMenu

---

# Definition First

Flutter Widget を直接生成してはいけない。

必ず Definition を経由すること。

悪い例

Flutter Widget を直接生成

良い例

YAML

↓

Definition

↓

Renderer

↓

Widget

---

# Extensibility

Framework のすべての機能は Plugin により拡張可能である。

Widget

Renderer

Field

Validator

Theme

Action

Layout

Parser

Plugin により追加できること。

Framework 本体を修正してはならない。

---

# Repository

Framework は Repository Interface のみを知る。

Repository の実装は利用者が行う。

Framework は HTTP や Database を知らない。

---

# Renderer

Renderer は Definition を Flutter Widget に変換する責務のみを持つ。

Business Logic を持ってはいけない。

Repository を持ってはいけない。

HTTP を呼んではいけない。

---

# DSL

DSL は Framework の最重要資産である。

DSL の後方互換性を最優先する。

DSL Version を必ず保持する。

Definition は YAML / JSON / API など取得方法に依存してはいけない。

内部では必ず PageDefinition に変換すること。

---

# AI Development Rules

AI は Flutter Widget を直接生成しない。

Definition を優先して生成する。

Definition が存在する場合 Widget を書いてはいけない。

Definition が不足する場合は DSL を拡張する提案を優先する。

Framework 本体より Plugin 化を優先する。

Definition の変更は後方互換性を考慮する。

Business Component を優先する。

UI Component を増やしてはいけない。

---

# Coding Rules

SOLID

Clean Architecture

DDD Friendly

Immutable Object

Single Responsibility

No Reflection

No Global State

No Static Business Logic

Prefer Composition

---

# Target

Flutter Stable

Material3

Desktop

Web

Android

iOS

Future Support

Fluent UI

Cupertino

---

# Goal

この Framework は Flutter を簡単に書くための Framework ではない。

Business Application を宣言的に構築するための Platform である。

Flutter は実装技術であり、本質ではない。

Business Definition が Framework の中心である。

すべての設計判断は Business Definition を最優先とすること。