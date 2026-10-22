import type {Metadata} from 'next';
import {PublicDocument} from '@/components/public-document';
export const metadata:Metadata={title:'Política de privacidad',alternates:{canonical:'/privacy'}};
export default function Privacy(){return <PublicDocument page="privacy"/>;}
