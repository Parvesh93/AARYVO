# AARYVO

AI sales employee for growing businesses.

## MVP promise
AARYVO answers website enquiries, qualifies buying intent, captures lead details and books appointments.

## Day-1 structure
- Marketing landing page
- Business onboarding shell
- Demo analytics dashboard
- MySQL/Prisma data model for users, businesses, agents, knowledge, conversations, leads and appointments
- Health endpoint

## Planned MVP sequence
1. Auth + workspace creation
2. Website ingestion + knowledge base
3. AI chat API
4. Embeddable website widget
5. Lead extraction + scoring
6. Appointment booking
7. Notifications + billing

## Local setup
1. Copy `.env.example` to `.env`
2. Configure MySQL and OpenAI credentials
3. `npm install`
4. `npx prisma generate`
5. `npx prisma migrate dev --name init`
6. `npm run dev`
