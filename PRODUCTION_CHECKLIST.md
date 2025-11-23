# Production Deployment Checklist

Use this checklist before deploying to production.

## Pre-Deployment

### Environment Variables
- [ ] `MONGODB_URI` - MongoDB connection string configured
- [ ] `SESSION_SECRET` - Generated secure secret (32+ characters)
- [ ] `ENCRYPTION_KEY` - Generated secure key (32+ characters)
- [ ] `NODE_ENV=production` - Set to production
- [ ] `CRON_SECRET` - Generated secure secret for cron jobs
- [ ] Optional: `TWILIO_*` - SMS configuration (if using SMS)
- [ ] Optional: `SMTP_*` - Email configuration (if using email)
- [ ] Optional: `CLOUDINARY_*` - File storage configuration (if using Cloudinary)

### Security
- [ ] All secrets are stored securely (not in code)
- [ ] `.env.local` is in `.gitignore` (verified)
- [ ] Security headers are configured (middleware.ts)
- [ ] SSL/TLS certificates configured
- [ ] Firewall rules configured
- [ ] Rate limiting tested

### Database
- [ ] MongoDB connection string tested
- [ ] Database indexes reviewed and optimized
- [ ] Backup strategy configured
- [ ] Connection pooling settings reviewed

### Application
- [ ] Health check endpoint tested: `GET /api/health`
- [ ] Error boundaries tested
- [ ] Logging configured and tested
- [ ] All API routes tested
- [ ] File uploads tested
- [ ] Authentication flow tested

### Monitoring
- [ ] Health check monitoring configured
- [ ] Error tracking service configured (Sentry, etc.)
- [ ] Log aggregation configured
- [ ] Uptime monitoring configured
- [ ] Alert rules configured

### Performance
- [ ] Load testing completed
- [ ] Response times acceptable
- [ ] Database query performance reviewed
- [ ] CDN configured (if applicable)
- [ ] Caching strategy implemented (if applicable)

### Documentation
- [ ] `.env.example` file created and documented
- [ ] Deployment process documented
- [ ] Rollback procedure documented
- [ ] Emergency contacts documented

## Post-Deployment

### Verification
- [ ] Health check returns 200: `GET /api/health`
- [ ] Application loads correctly
- [ ] Authentication works
- [ ] Database connections working
- [ ] File uploads working
- [ ] Email/SMS working (if configured)
- [ ] Cron jobs running (if configured)

### Monitoring
- [ ] Error rates are normal
- [ ] Response times are acceptable
- [ ] Database connections are stable
- [ ] No memory leaks detected
- [ ] Disk space is adequate

## Rollback Plan

If issues are detected:

1. **Immediate Rollback**
   - Revert to previous deployment
   - Verify rollback successful
   - Check health endpoint

2. **Investigation**
   - Review error logs
   - Check monitoring dashboards
   - Identify root cause

3. **Fix and Redeploy**
   - Fix identified issues
   - Test in staging
   - Redeploy to production

## Emergency Contacts

- **DevOps Team**: [Add contact]
- **Database Admin**: [Add contact]
- **Security Team**: [Add contact]
- **On-Call Engineer**: [Add contact]

## Quick Commands

```bash
# Check health
curl https://your-domain.com/api/health

# Check environment variables (in production shell)
env | grep -E 'MONGODB_URI|SESSION_SECRET|NODE_ENV'

# View logs (adjust based on your logging setup)
# For Vercel: vercel logs
# For Docker: docker logs <container>
# For PM2: pm2 logs
```

## Notes

- Keep this checklist updated with your specific deployment process
- Document any custom steps or configurations
- Review and update quarterly

