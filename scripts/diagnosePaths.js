/**
 * Diagnostic script to check all registered routes in the Express app
 * Run this with: node scripts/diagnosePaths.js
 */
const express = require('express');
const path = require('path');
const app = require('../app');

console.log('=== Registered Routes ===');
console.log('METHOD\tPATH');
console.log('----------------------');

// Function to print all registered routes
function printRoutes(stack, basePath = '') {
  stack.forEach(layer => {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods)
        .filter(method => layer.route.methods[method])
        .join(', ').toUpperCase();
      
      console.log(`${methods}\t${basePath}${layer.route.path}`);
    } else if (layer.name === 'router' && layer.handle.stack) {
      // This is a router middleware
      let routerBasePath = basePath;
      if (layer.regexp && typeof layer.regexp.toString === 'function') {
        const match = layer.regexp.toString().match(/^\/\^\\\/([^\\]+)/);
        if (match) {
          routerBasePath += `/${match[1]}`;
        }
      }
      printRoutes(layer.handle.stack, routerBasePath);
    }
  });
}

// Print all routes
printRoutes(app._router.stack);

console.log('\n=== End of Routes ===');
