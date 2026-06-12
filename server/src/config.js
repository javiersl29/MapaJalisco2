import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 3000),
  jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/mapajalisco2',
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  publicBaseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:3000',
  bootstrapAdmin: {
    username: process.env.BOOTSTRAP_ADMIN_USER || 'admin',
    password: process.env.BOOTSTRAP_ADMIN_PASS || 'admin123',
  },
};
