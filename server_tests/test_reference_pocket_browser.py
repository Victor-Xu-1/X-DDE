"""Read retained actual native pocket output; one view, exact residues and downloads."""
import hashlib
import json
import os
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

from server_tests.test_navigation_shell_browser import settings


@pytest.mark.parametrize('language,width', [('en', 1440), ('zh', 390)])
def test_reference_pocket_uses_one_exact_receptor_ligand_region(language, width):
    base = os.environ['WB_BROWSER_URL']
    evidence = Path('server_tests/evidence/reference-pocket')
    evidence.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page(viewport={'width': width, 'height': 1000})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(base)
        original_count = len(page.request.get(base + '/api/jobs').json())
        info = page.request.get(base + '/api/examples/diffsbdd.pocket?profile=archive').json()
        identifier = info['pin']['job_id']
        native = page.request.get(base + f'/api/jobs/{identifier}/result').json()
        assert native['operation'] == 'diffsbdd' and native['mode'] == 'pocket'
        assert native['residues'] and native['reference_artifact']
        if language == 'zh':
            settings(page, 'en')
            page.locator('#settings-language').select_option('zh')
        page.goto(base + '/#task=' + identifier)
        region = page.get_by_role(
            'region',
            name='参考口袋检查结果' if language == 'zh' else 'Reference pocket inspection',
        )
        expect(region).to_be_visible()
        expect(page.locator('.viewer-panel')).to_have_count(1)
        count = len(set(native['residues']))
        caption = '已定位区域残基：' if language == 'zh' else 'Region residues located:'
        try:
            expect(region.get_by_text(caption + f' {count} / {count}', exact=True)).to_be_visible(
                timeout=30000
            )
        except AssertionError:
            page.screenshot(path=evidence / f'{language}-{width}-failure.png', full_page=True)
            (evidence / f'{language}-{width}-failure.json').write_text(json.dumps({
                'url': page.url, 'visible_result': region.inner_text(), 'page_errors': errors,
                'native_residues': native['residues'],
            }, ensure_ascii=False, indent=2), encoding='utf-8')
            raise
        expect(region.get_by_role(
            'button',
            name='生成三维视图图片' if language == 'zh' else 'Capture 3D view', exact=True,
        )).to_be_enabled()
        region.locator('summary').click()
        expect(region.locator('tbody tr')).to_have_count(count)
        for field in ('protein_artifact', 'pocket_artifact', 'reference_artifact'):
            name = native[field]
            response = page.request.get(
                base + f'/api/jobs/{identifier}/download', params={'name': name}
            )
            assert response.status == 200 and response.body()
            (evidence / (language + '-' + name)).write_bytes(response.body())
            original = Path(os.environ['WB_STATE_DIR']) / 'jobs' / identifier / 'output' / name
            assert hashlib.sha256(response.body()).digest() == hashlib.sha256(
                original.read_bytes()
            ).digest()
        assert len(page.request.get(base + '/api/jobs').json()) == original_count
        assert not errors
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth + 1')
        page.screenshot(path=evidence / f'{language}-{width}.png', full_page=True)
        browser.close()
