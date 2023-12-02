/*
 * SPDX-License-Identifier: GPL-3.0
 * Copyright (C) 2020-2022 Brian Masney <masneyb@onstation.org>
 */

let nextSearchInput = 0;

function createOptionNode(text, value) {
  const option = document.createElement('option');
  option.value = value;
  option.innerText = text;
  return option;
}

function updateSearchCriteria() {
  updateOverallStatusMessage('Searching');
  hideResultsInfo();

  setFullImageDisplay(false);

  window.setTimeout(() => {
    const searchArgs = [];
    for (const critChild of document.querySelector('#search_criterias').children) {
      const field = critChild.querySelector('.search_field').value;
      const op = critChild.querySelector('.search_op').value;

      let search = `${field},${op}`;
      for (const valChild of critChild.querySelector('.search_values').children) {
        search += `,${valChild.value}`;
      }
      searchArgs.push(`search=${encodeURIComponent(search)}`);
    }

    const matchPolicy = document.querySelector('#match').value;
    const sortBy = document.querySelector('#sort').value;
    const iconSize = document.querySelector('#icons').value;
    const groupBy = document.querySelector('#group').value;
    window.history.pushState({}, '', `index.html?${searchArgs.join('&')}&match=${matchPolicy}&sort=${sortBy}&icons=${iconSize}&group=${groupBy}#`);
    processJson(populateMedia);
  }, 0);
}

function updateCritieraIfValuesPopulated(idx) {
  const searchEles = document.querySelector(`#search_criteria${idx}`);
  for (const child of searchEles.querySelector('.search_values').children) {
    if (child.value === '' || !child.checkValidity()) {
      return;
    }
  }

  updateSearchCriteria();
}

function removeAllChildren(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

function searchOpChanged(idx) {
  const searchEles = document.querySelector(`#search_criteria${idx}`);
  const field = searchFields[searchEles.querySelector('.search_field').selectedIndex];
  const op = field.search.ops[searchEles.querySelector('.search_op').selectedIndex];

  const values = searchEles.querySelector('.search_values');
  const existingValues = [];
  if (op.numValues === values.children.length) {
    for (const child of values.children) {
      existingValues.push([child.type, child.placeholder, child.value]);
    }
  }

  removeAllChildren(values);

  for (let i = 0; i < op.numValues; i += 1) {
    if ('validValues' in field) {
      const select = document.createElement('select');
      select.appendChild(createOptionNode('', ''));
      for (const validValue of field.validValues) {
        select.appendChild(createOptionNode(validValue[0], validValue[1]));
      }
      select.onchange = () => { updateCritieraIfValuesPopulated(idx); };
      values.appendChild(select);
    } else {
      const input = document.createElement('input');
      input.className = `search_value${i}`;
      input.type = 'inputType' in op ? op.inputType[i] : 'text';
      if ('inputStep' in op) {
        input.step = op.inputStep[i];
      }
      const size = 'inputSize' in op ? op.inputSize[i] : 6;
      input.style.width = `${size}em`;
      input.placeholder = 'placeholder' in op && op.placeholder[i] != null ? op.placeholder[i] : '';
      if ('inputMin' in op && op.inputMin[i] != null) {
        input.min = op.inputMin[i];
      }
      if ('inputMax' in op && op.inputMax[i] != null) {
        input.max = op.inputMax[i];
      }
      if ('inputStep' in op && op.inputStep[i] != null) {
        input.step = op.inputStep[i];
      }

      input.onchange = () => { window.blur(); updateCritieraIfValuesPopulated(idx); };

      if (i < existingValues.length && existingValues[i][0] === input.type && existingValues[i][1] === input.placeholder) {
        input.value = existingValues[i][2];
      }

      values.appendChild(input);
    }
  }
}

function searchFieldChanged(idx) {
  const searchEles = document.querySelector(`#search_criteria${idx}`);
  const field = searchFields[searchEles.querySelector('.search_field').selectedIndex];

  const select = searchEles.querySelector('.search_op');
  removeAllChildren(select);

  for (const op of field.search.ops) {
    const option = document.createElement('option');
    option.textContent = option.value = op.descr;
    select.appendChild(option);
  }

  searchOpChanged(idx);
}

function populateSearchFields(idx) {
  const searchEles = document.querySelector(`#search_criteria${idx}`);
  const select = searchEles.querySelector('.search_field');
  removeAllChildren(select);

  for (const field of searchFields) {
    const option = document.createElement('option');
    option.textContent = option.value = field.title;
    select.appendChild(option);
  }

  searchFieldChanged(idx);
}

function addSearchInputRow() {
  const template = document.querySelector('#search_criteria_row');

  const row = template.content.cloneNode(true);
  row.querySelector('.search_criteria').id = `search_criteria${nextSearchInput}`;

  const fieldOnChange = function (idx) {
    return function () {
      searchFieldChanged(idx);
      updateCritieraIfValuesPopulated(idx);
    };
  };
  row.querySelector('.search_field').onchange = fieldOnChange(nextSearchInput);

  const opOnChange = function (idx) {
    return function () {
      searchOpChanged(idx);
      updateCritieraIfValuesPopulated(idx);
    };
  };
  row.querySelector('.search_op').onchange = opOnChange(nextSearchInput);

  const delRow = function (idx) {
    return function () {
      const ele = document.querySelector(`#search_criteria${idx}`);
      ele.remove();
      updateSearchCriteria();
    };
  };
  row.querySelector('.search_delete_row').onclick = delRow(nextSearchInput);

  document.querySelector('#search_criterias').appendChild(row);
  populateSearchFields(nextSearchInput);
  nextSearchInput += 1;
}

function populateSearchValuesFromUrl() {
  removeAllChildren(document.querySelector('#search_criterias'));
  nextSearchInput = 0;

  for (const searchCriteria of getSearchQueryParams()) {
    const curIdx = nextSearchInput;
    addSearchInputRow();

    const parts = searchCriteria.split(',');
    if (parts.length < 2) {
      continue;
    }

    const searchEles = document.querySelector(`#search_criteria${curIdx}`);

    const fieldEle = searchEles.querySelector('.search_field');
    fieldEle.value = parts[0];
    searchFieldChanged(curIdx);
    const field = searchFields[fieldEle.selectedIndex];

    const opEle = searchEles.querySelector('.search_op');
    opEle.value = parts[1];
    searchOpChanged(curIdx);
    const op = field.search.ops[opEle.selectedIndex];

    for (let i = 0; i < Math.min(parts.length - 2, op.numValues); i += 1) {
      searchEles.querySelector('.search_values').children[i].value = parts[i + 2];
    }
  }

  const matchPolicy = getQueryParameter('match', 'all'); // any,none,all
  document.querySelector('#match').value = matchPolicy;

  const sortBy = getQueryParameter('sort', 'default');
  document.querySelector('#sort').value = sortBy;

  const iconSize = getQueryParameter('icons', 'default');
  document.querySelector('#icons').value = iconSize;

  const groupBy = getQueryParameter('group', 'none');
  document.querySelector('#group').value = groupBy;

  if (nextSearchInput === 0) {
    addSearchInputRow();
  }
}

function clearSearchCriteria() {
  window.history.pushState({}, '', 'index.html?#');
  processJson(populateMedia);
}
