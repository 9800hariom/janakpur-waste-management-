import { Inter, Poppins } from 'next/font/google'

export const inter = Inter({ subsets: ['latin'], display: 'swap' })

export const poppins = Poppins({
  weight: ['300', '400', '600'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-poppins',
})
