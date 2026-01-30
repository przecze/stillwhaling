# Stillwhaling Deployment

Ansible playbook for deploying stillwhaling.janczechowski.com to the "bluh" server.

## Prerequisites

1. **SSH access to "bluh" server** - Make sure your `~/.ssh/config` has "bluh" defined
2. **Ansible installed** - `pip install ansible` or `brew install ansible`
3. **DNS configured** - Add A record: `stillwhaling.janczechowski.com -> <server-ip>`
4. **nginx-proxy running** - The server should have nginx-proxy with docker-gen running

## Deployment

```bash
cd ansible
ansible-playbook deploy.yml
```

## What it does

1. Creates `/srv/projects/stillwhaling` on the server
2. Syncs project files (excludes .git, node_modules, dist, etc.)
3. Stops existing containers (`docker compose down`)
4. Builds and starts Docker containers (`docker compose up -d --build`)
   - `frontend`: Vite dev server (development mode)
   - `nginx`: Nginx proxy that connects to nginx-proxy network
5. Connects to nginx-proxy network for automatic SSL/domain routing

## Safety

- Only touches `/srv/projects/stillwhaling` directory
- Does not modify nginx-proxy configuration
- Does not change DNS (you must do that manually)
- All docker operations scoped to project directory

## Manual steps after deployment

1. **DNS**: Add A record for `stillwhaling.janczechowski.com` pointing to server IP
2. **SSL**: Let's Encrypt will auto-provision via nginx-proxy
3. **Data updates**: Update `public/data/whaling_data.json` and restart services:
   ```bash
   cd /srv/projects/stillwhaling
   docker compose restart frontend nginx
   ```
