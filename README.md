# PollHub

A small online voting app. Voters register, sign in, choose one option, review it, and cast a single vote. Results update live, and admins get a dashboard to manage options and users.

## Features

- Register and sign in, with an optional email for password recovery
- One vote per voter, with a review step before the vote is final
- Live results shown after voting
- Admin dashboard: vote statistics, add or remove options, retry failed votes, reset the election, and reset a user's password
- Password reset by emailed link, or by an admin who issues a temporary password

## How it works

| Part | Technology | Role |
| --- | --- | --- |
| `frontend/` | React + Vite | Landing page, ballot, results, admin dashboard |
| `api/` | Python + Flask | Accounts, voting rules, results, admin endpoints |
| `worker/` | Node.js | Takes queued votes from Redis and saves them to the database |
| Database | PostgreSQL | Users, options, votes, password reset tokens |
| Queue and cache | Redis | Vote queue, one-vote-per-user check, live result counts |

Votes are accepted by the API, placed in a Redis queue, and saved to PostgreSQL by the worker.

## Run it locally

You need [Docker](https://docs.docker.com/get-docker/) with Docker Compose.

```bash
git clone https://github.com/emanex4real/pollhub.git
cd pollhub
cp .env.example .env
```

Edit `.env` and set real values for `POSTGRES_PASSWORD` and `JWT_SECRET`, then start everything:

```bash
docker compose up -d --build
```

Open <http://localhost:8080>. The API listens on port 5000.

The account whose username matches `ADMIN_USERNAME` (default `admin`) becomes the admin when it registers.

To stop the app, run `docker compose down`. Add `-v` to also delete the local database.

## Configuration

Settings live in `.env`. See `.env.example` for the full list.

| Variable | Purpose |
| --- | --- |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Database login |
| `JWT_SECRET` | Secret used to sign login tokens. Use a long random string |
| `ADMIN_USERNAME` | Username that becomes the admin |
| `APP_URL` | Public address of the site, used in password reset links |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Mail server for reset emails |

If `SMTP_HOST` is empty, reset links are written to the API log instead of being emailed. Use that only for local testing.

## Tests

```bash
pip install -r api/requirements.txt && pytest api/tests    # API
cd worker && npm install && npm test                       # worker
```

## CI/CD

Every push runs the pipeline in `.github/workflows/ci-cd.yml`:

1. CodeQL analysis and tests
2. Docker image builds with Trivy vulnerability scans
3. On `main`: images are published to Docker Hub
4. On `main`: the app is deployed to an EC2 instance through AWS Systems Manager, with no SSH. GitHub signs in to AWS using OIDC, so no AWS keys are stored in GitHub.

The deploy needs these repository secrets: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, `AWS_ROLE_ARN` and `EC2_INSTANCE_ID`.

## Project layout

```
api/                     Flask API and database schema
worker/                  Vote worker
frontend/                React app
docker-compose.yml       Local development stack
docker-compose.prod.yml  Production stack (used by the deploy)
.github/workflows/       CI/CD pipeline
```
