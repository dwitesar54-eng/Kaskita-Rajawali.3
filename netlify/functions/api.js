const GAS_URL = process.env.GAS_URL || 'https://script.google.com/macros/s/AKfycbxSWR5_lg1WGv6eNgDCtQx6HJatRMgSzsnD64e37jGN3JmfllgUb1oMIKDQDKS90Y1X/exec';

exports.handler = async function(event) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: cors,
      body: JSON.stringify({
        ok: false,
        error: 'Method tidak diizinkan.'
      })
    };
  }

  try {
    if (!event.body) throw new Error('Request kosong.');

    const body = JSON.parse(event.body);

    if (!body || typeof body !== 'object' || !body.endpoint) {
      throw new Error('Request API tidak valid.');
    }

    if (!Array.isArray(body.args)) body.args = [];

    const upstream = await fetch(GAS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      redirect: 'follow'
    });

    const text = await upstream.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch (_) {
      throw new Error('Respons backend GAS tidak valid.');
    }

    return {
      statusCode: data && data.ok === false ? 400 : 200,
      headers: cors,
      body: JSON.stringify(data)
    };

  } catch (err) {

    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({
        ok: false,
        error: String(
          err && err.message ||
          err ||
          'Gagal terhubung ke backend.'
        )
      })
    };
  }
};
