const corsOriginsRaw =
  process.env['CORS_ORIGINS'] ||
  process.env['CORS_ORIGIN'] ||
  'http://localhost:3000';

export default () => ({
  port: parseInt(process.env['PORT'] || '3001', 10),
  nodeEnv: process.env['NODE_ENV'] || 'development',
  database: {
    url: process.env['DATABASE_URL'] || 'file:./dev.db',
  },
  // Looser boolean parsing prevents env drift between local/dev/prod
  // (e.g. "TRUE", "1", "yes") causing features to silently disable.
  jwt: {
    secret: process.env['JWT_SECRET'] || 'change-me-in-production',
    expiresIn: process.env['JWT_EXPIRES_IN'] || '30m',
    refreshExpiresIn: process.env['JWT_REFRESH_EXPIRES_IN'] || '7d',
  },
  cors: {
    origins: corsOriginsRaw
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  },
  s3: {
    enabled: parseBoolean(process.env['S3_ENABLED']),
    bucket: process.env['S3_BUCKET_NAME'] || '',
    region: process.env['S3_REGION'] || '',
    accessKeyId: process.env['S3_ACCESS_KEY_ID'] || '',
    secretAccessKey: process.env['S3_SECRET_ACCESS_KEY'] || '',
    endpoint: process.env['S3_ENDPOINT'] || '',
    forcePathStyle: parseBoolean(process.env['S3_FORCE_PATH_STYLE']),
  },
  ses: {
    enabled: parseBoolean(process.env['SES_ENABLED']),
    region: process.env['SES_REGION'] || '',
    accessKeyId: process.env['SES_ACCESS_KEY_ID'] || '',
    secretAccessKey: process.env['SES_SECRET_ACCESS_KEY'] || '',
    sourceEmail: process.env['SES_SOURCE_EMAIL'] || '',
    fromName: process.env['SES_FROM_NAME'] || 'PlotFarm Estate',
  },
  sns: {
    enabled: parseBoolean(process.env['SNS_ENABLED']),
    region: process.env['SNS_REGION'] || '',
    accessKeyId: process.env['SNS_ACCESS_KEY_ID'] || '',
    secretAccessKey: process.env['SNS_SECRET_ACCESS_KEY'] || '',
    senderId: process.env['SNS_SENDER_ID'] || '',
    smsType: process.env['SNS_SMS_TYPE'] || 'Transactional',
    defaultCountryCode: process.env['SMS_DEFAULT_COUNTRY_CODE'] || '+91',
  },
  otp: {
    expiresInMinutes: parseInt(process.env['OTP_EXPIRES_IN_MINUTES'] || '10', 10),
    maxAttempts: parseInt(process.env['OTP_MAX_ATTEMPTS'] || '5', 10),
    // When enabled, a fixed OTP is used and delivery (WhatsApp/SMS/email) is skipped.
    // Defaults to true so dev/staging deploys work without WhatsApp. Set OTP_USE_DEV_DEFAULT=false for real OTP delivery.
    useDevDefault: parseBoolean(process.env['OTP_USE_DEV_DEFAULT'], true),
    devDefaultCode: process.env['OTP_DEV_DEFAULT_CODE'] || '111111',
  },
  whatsapp: {
    enabled: parseBoolean(process.env['WHATSAPP_ENABLED']) || (!!process.env['WHATSAPP_API_KEY'] && process.env['WHATSAPP_API_KEY'] !== 'replace-me'),
    apiUrl: (process.env['WHATSAPP_API_URL'] || 'http://api.tezsolutions.in:3000/api/sendText').trim(),
    apiKey: process.env['WHATSAPP_API_KEY'] || '',
    session: process.env['WHATSAPP_SESSION'] || 'default',
    timeoutMs: parseInt(process.env['WHATSAPP_TIMEOUT_MS'] || '10000', 10),
    debugLogFile: (process.env['WHATSAPP_DEBUG_LOG_FILE'] || '').trim(),
  },
});

function parseBoolean(value: string | undefined, defaultValue = false) {
  if (value == null) return defaultValue;
  switch (value.trim().toLowerCase()) {
    case '1':
    case 'true':
    case 'yes':
    case 'y':
    case 'on':
      return true;
    case '0':
    case 'false':
    case 'no':
    case 'n':
    case 'off':
      return false;
    default:
      return defaultValue;
  }
}
