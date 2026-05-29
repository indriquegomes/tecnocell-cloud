'use client'
import { useRef, useState } from 'react'

interface Props {
  currentUrl?: string | null
}

export function ImageUpload({ currentUrl }: Props) {
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPreview(URL.createObjectURL(file))
  }

  return (
    <div className="sm:col-span-2">
      <label className="mb-1.5 block text-sm font-medium text-gray-700">Foto do Produto</label>
      <div className="flex items-start gap-4">
        <div
          onClick={() => inputRef.current?.click()}
          className="relative h-32 w-32 flex-shrink-0 cursor-pointer overflow-hidden rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50 transition"
        >
          {preview ? (
            <img src={preview} alt="Preview" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-1 text-gray-400">
              <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-xs">Clique para adicionar</span>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2 pt-1 text-sm text-gray-500">
          <p>JPG, PNG ou WEBP</p>
          <p>Máximo 5MB</p>
          {preview && (
            <button
              type="button"
              onClick={() => { setPreview(null); if (inputRef.current) inputRef.current.value = '' }}
              className="text-xs text-red-500 hover:text-red-700 text-left"
            >
              Remover foto
            </button>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        name="imagem"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleChange}
        className="hidden"
      />
    </div>
  )
}