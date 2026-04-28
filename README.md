# Tantaropic Backend

---

## Database Setup & Migrations (Prisma)

This project uses Prisma ORM for database management. Since we are using Prisma 7 with the adapter-based approach for Neon PostgreSQL, the `DATABASE_URL` is defined in `.env` and loaded via `prisma.config.ts`, **not** directly in `schema.prisma`.

### 1. Creating or Modifying a Table (Schema)

To create a new table or modify an existing one, update the `prisma/schema.prisma` file.

Example of adding a new table:

```prisma
model NewTable {
  id        String   @id @default(uuid())
  name      String
  createdAt DateTime @default(now())
}
```

_Note: Do not add the `url` or `directUrl` properties to the `datasource` block in `schema.prisma`. This is handled by `prisma.config.ts`._

### 2. Running Migrations

After updating the schema, you need to generate a migration and apply it to your database.

To create and apply a migration to your development database:

```bash
npm run db:migrate --name added_new_table
```

_(If the `db:migrate` script is not in `package.json`, you can run `npx prisma migrate dev --name added_new_table`)_

If you just want to push the schema changes directly to the database without creating a migration history file (e.g., during rapid prototyping):

```bash
npx prisma db push
```

### 3. Generating the Prisma Client

Whenever you update the schema or pull new changes, you must regenerate the Prisma Client so your TypeScript code recognizes the new models:

```bash
npx prisma generate
```

---

## How to Run the Project

Follow these steps to get your local environment up and running:

### Prerequisites

Make sure you have your `.env` file configured with the `DATABASE_URL`:

```env
DATABASE_URL="postgres://<user>:<password>@<host>/<db>?sslmode=require"
```

### Commands

```bash
npm install       # Installs all the dependencies.
npm run start:dev # Runs the application in development mode with hot-reloading.
npm run build     # Compiles the TypeScript code into JavaScript in the dist folder.
npm run start     # Runs the application in production mode.
npm run format    # Automatically formats the code according to Prettier rules.
```
