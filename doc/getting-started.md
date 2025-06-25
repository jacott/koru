# Getting started

This guide describes how to build a koru single-page application (SPA). We will be building a simple home library application called **my-library**.

---

## Create database

Ensure you have admin access to PostgreSQL

* `sudo -u postgres createuser -drs $USER`
* `createdb my-librarydemo`

---

## Create initial project

* `mkdir my-library && cd my-library && npm init -y`
* `npm install --save koru`
* `` `npm bin`/koru new``
* `git init . && git add . && git commit -m 'initial'`

---

## Generate a new Model

To generate a model, say, a Book; run the following

* `./scripts/koru g model Book title author published:date pages:integer`
* Migrate the database: `./scripts/koru db-migrate`
* Dump database schema to disk: `./scripts/koru db-schema-dump`
