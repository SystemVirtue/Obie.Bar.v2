# DNS Configuration Guide

## Setting up Wildcard Subdomains on Render

To enable custom subdomains (e.g., `mikes.obie.bar`), you'll need to configure your DNS settings as follows:

1. **Add DNS Records**
   - Log in to your DNS provider's dashboard
   - Add the following records:

   ```
   Type: CNAME
   Name: *.obie.bar
   Value: your-render-app-domain.render.com
   TTL: 3600 (or default)
   ```

   ```
   Type: CNAME
   Name: obie.bar
   Value: your-render-app-domain.render.com
   TTL: 3600 (or default)
   ```

2. **Verify DNS Records**
   - Wait for DNS changes to propagate (this can take up to 48 hours)
   - Use a tool like `dig` or online DNS checkers to verify your records

3. **Configure Render**
   - Go to your Render dashboard
   - Navigate to your web service settings
   - Under "Custom Domains", add:
     - `*.obie.bar`
     - `obie.bar`

4. **SSL/TLS Configuration**
   - Render will automatically handle SSL certificates for your custom domains
   - Wait for the certificates to be issued (this can take a few minutes)

## Testing Your Setup

1. Register a new user with a custom subdomain
2. Access the application using your custom URL
3. Verify that:
   - Your settings are persistent
   - The player window loads correctly
   - Queue management works independently

## Troubleshooting

If you encounter issues:
1. Check DNS propagation using online tools
2. Verify SSL certificate status in Render
3. Check browser console for any errors
4. Ensure your Render service is running
