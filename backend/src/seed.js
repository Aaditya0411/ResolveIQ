import { resetSeed, db } from './store.js'; resetSeed(); console.log(`Seeded ${db.tickets.size} demo tickets and ${db.policies.length} policies.`);
