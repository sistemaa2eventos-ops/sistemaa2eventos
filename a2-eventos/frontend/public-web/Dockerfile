FROM node:18-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Criar grupo e usuário não-root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# O Next.js standalone precisa da pasta public e static separadamente
COPY --chown=nextjs:nodejs .next/standalone ./
COPY --chown=nextjs:nodejs .next/static ./.next/static
COPY --chown=nextjs:nodejs public ./public

# Garantir permissões de execução (resolve Erro 126 de Windows→Linux)
RUN chmod -R 755 /app

USER nextjs

EXPOSE 3000

# O servidor standalone é iniciado via node server.js
CMD ["node", "server.js"]
