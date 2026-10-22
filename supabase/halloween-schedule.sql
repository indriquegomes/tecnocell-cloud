-- Supabase Cron: independent from the checkout, no HTTP credentials required.
create extension if not exists pg_cron;
select cron.schedule('halloween-sales-reconcile','* * * * *','select halloween_private.sync_sales();');
select jobid,jobname,schedule,active from cron.job where jobname='halloween-sales-reconcile';
