#!/usr/bin/env node

// Simple test script to check if plugin loads correctly
import { litPlugin } from './dist/index.js';

console.log('🧪 Testing Lit Protocol Plugin');
console.log('Plugin Name:', litPlugin.name);
console.log('Plugin Description:', litPlugin.description);
console.log('Actions:', litPlugin.actions.map(a => a.name));
console.log('Services:', litPlugin.services.map(s => s.name || s.serviceType));
console.log('Providers:', litPlugin.providers.map(p => p.name));

console.log('\n✅ Plugin loads successfully!');
console.log('\n📝 Next steps:');
console.log('1. Get a real GOOGLE_GENAI_API_KEY');
console.log('2. Test wallet creation: "create wallet"');
console.log('3. Test balance check: "check balance"');
console.log('4. Get Sepolia testnet ETH from a faucet');
console.log('5. Test sending ETH: "send 0.1 ETH to 0x..."');