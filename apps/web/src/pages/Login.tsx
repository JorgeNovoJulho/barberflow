import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

const Login: React.FC = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) throw new Error('Credenciais inválidas')
      const data = await res.json()
      localStorage.setItem('token', data.token)
      navigate('/dashboard')
    } catch {
      setError('Email ou senha incorretos')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
        <div className="text-center mb-8">
          <Link to="/" className="text-3xl font-bold text-green-700">BarberFlow</Link>
          <h1 className="mt-6 text-2xl font-bold text-gray-900">Entrar na sua conta</h1>
          <p className="mt-2 text-gray-600">Gerencie sua barbearia</p>
        </div>
        {error && <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none" />
          </div>
          <button type="submit" className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 transition">
            Entrar
          </button>
        </form>
        <p className="mt-6 text-center text-gray-600">
          Não tem conta? <Link to="/register" className="text-green-600 hover:underline">Criar conta grátis</Link>
        </p>
        <p className="mt-4 text-center text-sm text-gray-500">
          Super Admin: jorgericardosalgado@gmail.com / jorge0609
        </p>
      </div>
    </div>
  )
}

export default Login
