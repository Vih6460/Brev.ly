import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { WarningIcon } from '@phosphor-icons/react';
import { api, ApiError } from '../lib/api';
import { config } from '../lib/config';
import { linkFormSchema, type LinkFormValues } from '../lib/validation';
import { Spinner } from './spinner';
import { useToast } from './toast';

export function LinkForm() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    clearErrors,
    watch,
    formState: { errors },
  } = useForm<LinkFormValues>({
    resolver: zodResolver(linkFormSchema),
    defaultValues: { originalUrl: '', shortCode: '' },
    mode: 'onTouched',
  });
  const create = useMutation({
    mutationFn: api.create,
    onSuccess: async () => {
      reset();
      toast('Link criado com sucesso!');
      await queryClient.invalidateQueries({ queryKey: ['links'] });
    },
    onError: (error: Error) => {
      if (error instanceof ApiError && error.code === 'SHORT_CODE_ALREADY_EXISTS') {
        setError('shortCode', { message: error.message }, { shouldFocus: true });
      } else {
        setError('root', { message: error.message });
      }
    },
  });
  const host = config.frontendUrl.replace(/^https?:\/\//, '') + '/';
  const [originalUrl, shortCode] = watch(['originalUrl', 'shortCode']);
  return (
    <section className="card new-link" aria-labelledby="new-link-title">
      <h1 id="new-link-title">Novo link</h1>
      <form
        onSubmit={handleSubmit((values) => {
          clearErrors('root');
          create.mutate(values);
        })}
        noValidate
        aria-busy={create.isPending}
      >
        <fieldset disabled={create.isPending}>
          <div className={`field ${errors.originalUrl ? 'field-error' : ''}`}>
            <label className="field-label" htmlFor="original-url">
              Link original
            </label>
            <input
              id="original-url"
              type="url"
              placeholder="www.exemplo.com.br"
              autoComplete="url"
              spellCheck={false}
              aria-invalid={Boolean(errors.originalUrl)}
              aria-describedby={errors.originalUrl ? 'original-url-error' : undefined}
              {...register('originalUrl')}
            />
            {errors.originalUrl && (
              <p id="original-url-error" className="field-message" role="alert">
                <WarningIcon size={16} />
                {errors.originalUrl.message}
              </p>
            )}
          </div>
          <div className={`field ${errors.shortCode ? 'field-error' : ''}`}>
            <label className="field-label" htmlFor="short-code">
              Link encurtado
            </label>
            <label className="input-prefix" htmlFor="short-code">
              <span title={host}>{host}</span>
              <input
                id="short-code"
                type="text"
                aria-label="Link encurtado"
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={Boolean(errors.shortCode)}
                aria-describedby={errors.shortCode ? 'short-code-error' : undefined}
                {...register('shortCode')}
              />
            </label>
            {errors.shortCode && (
              <p id="short-code-error" className="field-message" role="alert">
                <WarningIcon size={16} />
                {errors.shortCode.message}
              </p>
            )}
          </div>
          {errors.root && (
            <p className="form-error" role="alert">
              <WarningIcon size={16} />
              {errors.root.message}
            </p>
          )}
          <button
            className="button-primary"
            type="submit"
            disabled={create.isPending || !originalUrl.trim() || !shortCode.trim()}
          >
            {create.isPending && <Spinner />}
            {create.isPending ? 'Salvando…' : 'Salvar link'}
          </button>
        </fieldset>
      </form>
    </section>
  );
}
