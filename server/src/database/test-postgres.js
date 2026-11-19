import { testPostgresConnection, pgConfig } from './postgres.js';

console.log('Testing PostgreSQL connection with config:');
console.log({
  host: pgConfig.host,
  port: pgConfig.port,
  user: pgConfig.user,
  database: pgConfig.database
});

testPostgresConnection().then((res) => {
  if (res.connected) {
    console.log('✅ Connection Successful!');
    console.log('Server Time:', res.time);
    console.log('Connected Database:', res.database);
    process.exit(0);
  } else {
    console.log('❌ Connection Failed:', res.error);
    process.exit(1);
  }
});
