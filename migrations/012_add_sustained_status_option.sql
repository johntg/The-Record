INSERT INTO public.status_options (name) VALUES ('Sustained') ON CONFLICT (name) DO NOTHING;
