import {test,expect} from '@playwright/test'; test('login surface is available',async({page})=>{await page.goto('/');await expect(page.getByText('Welcome back')).toBeVisible();});
