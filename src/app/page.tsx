import ChatWindow from '@/components/ChatWindow';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Chat - उत्तारम्',
  description: 'Chat with the internet, chat with उत्तारम्.',
};

const Home = () => {
  return <ChatWindow />;
};

export default Home;
