document.addEventListener("DOMContentLoaded", () => {
  const chart = document.getElementById("categoryChart");
  if (chart && window.Chart) {
    new Chart(chart, {
      type: "doughnut",
      data: {
        labels: ["Electronics", "Footwear", "Clothing", "Bags", "Accessories", "Others"],
        datasets: [{
          data: [35, 20, 15, 12, 10, 8],
          borderWidth: 3,
          borderColor: "#fff"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
          legend: {
            position: "right",
            labels: { usePointStyle: true, padding: 16, font: { family: "Inter", size: 12 } }
          }
        }
      }
    });
  }

  [
    ["productSearch", "productsTable"],
    ["productSearchPage", "productsPageTable"]
  ].forEach(([searchId, tableId]) => {
    const search = document.getElementById(searchId);
    const table = document.getElementById(tableId);
    if (search && table) {
      search.addEventListener("input", e => {
        const term = e.target.value.toLowerCase();
        table.querySelectorAll("tbody tr").forEach(row => {
          row.style.display = row.innerText.toLowerCase().includes(term) ? "" : "none";
        });
      });
    }
  });

  const mobileMenu = document.getElementById("mobileMenu");
  const sidebar = document.querySelector(".sidebar");
  if (mobileMenu && sidebar) {
    mobileMenu.addEventListener("click", () => sidebar.classList.toggle("open"));
  }

  const supplierForm = document.getElementById("supplierForm");
  const supplierFormTitle = document.getElementById("supplierFormTitle");
  const addSupplierButton = document.getElementById("addSupplierButton");
  const cancelSupplierEdit = document.getElementById("cancelSupplierEdit");

  const resetSupplierForm = () => {
    if (!supplierForm) return;
    supplierForm.action = "/suppliers/create";
    supplierForm.reset();
    if (supplierFormTitle) supplierFormTitle.textContent = "Add Supplier";
    const hiddenId = document.getElementById("supplierId");
    if (hiddenId) hiddenId.value = "";
  };

  if (addSupplierButton && supplierForm) {
    addSupplierButton.addEventListener("click", () => {
      resetSupplierForm();
      supplierForm.scrollIntoView({ behavior: "smooth", block: "start" });
      const nameInput = document.getElementById("supplier-name");
      if (nameInput) nameInput.focus();
    });
  }

  if (cancelSupplierEdit && supplierForm) {
    cancelSupplierEdit.addEventListener("click", resetSupplierForm);
  }

  const productModal = document.getElementById("productModal");
  const editProductForm = document.getElementById("editProductForm");
  const closeProductModal = () => {
    if (!productModal) return;
    productModal.hidden = true;
    document.body.style.overflow = "";
  };

  document.addEventListener("click", event => {
    const supplierButton = event.target.closest(".supplier-edit");
    if (supplierButton && supplierForm) {
      const card = supplierButton.closest(".supplier-card");
      if (!card) return;
      supplierForm.action = `/suppliers/${card.dataset.supplierId}/edit`;
      const hiddenId = document.getElementById("supplierId");
      if (hiddenId) hiddenId.value = card.dataset.supplierId || "";
      const nameInput = document.getElementById("supplier-name");
      const emailInput = document.getElementById("supplier-email");
      const phoneInput = document.getElementById("supplier-phone");
      const productsInput = document.getElementById("supplier-products");
      if (nameInput) nameInput.value = card.dataset.supplierName || "";
      if (emailInput) emailInput.value = card.dataset.supplierEmail || "";
      if (phoneInput) phoneInput.value = card.dataset.supplierPhone || "";
      if (productsInput) productsInput.value = card.dataset.supplierProducts || "0";
      if (supplierFormTitle) supplierFormTitle.textContent = "Edit Supplier";
      supplierForm.scrollIntoView({ behavior: "smooth", block: "start" });
      if (nameInput) nameInput.focus();
      return;
    }

    const deleteButton = event.target.closest(".supplier-delete");
    if (deleteButton) {
      const card = deleteButton.closest(".supplier-card");
      if (!card) return;
      if (!confirm(`Delete ${card.dataset.supplierName || "this supplier"}?`)) return;
      const form = document.createElement("form");
      form.method = "post";
      form.action = `/suppliers/${card.dataset.supplierId}/delete`;
      document.body.appendChild(form);
      form.submit();
      return;
    }

    const closeButton = event.target.closest("[data-close-product-modal]");
    if (closeButton) {
      closeProductModal();
      return;
    }

    const button = event.target.closest(".product-actions .action");
    if (!button) return;

    const row = button.closest("tr");
    if (button.classList.contains("stock-add") || button.classList.contains("stock-remove")) {
      const action = button.classList.contains("stock-add") ? "add" : "remove";
      const form = document.createElement("form");
      form.method = "post";
      form.action = `/products/${row.dataset.productId}/stock`;
      const actionInput = document.createElement("input");
      actionInput.type = "hidden";
      actionInput.name = "action";
      actionInput.value = action;
      const quantityInput = document.createElement("input");
      quantityInput.type = "hidden";
      quantityInput.name = "quantity";
      quantityInput.value = "1";
      form.appendChild(actionInput);
      form.appendChild(quantityInput);
      document.body.appendChild(form);
      form.submit();
      return;
    }

    if (button.classList.contains("delete")) {
      if (!confirm(`Delete ${row.dataset.productName || "this product"}?`)) return;
      const form = document.createElement("form");
      form.method = "post";
      form.action = `/products/${row.dataset.productId}/delete`;
      document.body.appendChild(form);
      form.submit();
      return;
    }

    if (button.classList.contains("edit") && productModal && editProductForm) {
      editProductForm.action = `/products/${row.dataset.productId}/edit`;
      editProductForm.elements.name.value = row.dataset.productName || "";
      editProductForm.elements.category.value = row.dataset.productCategory || "";
      editProductForm.elements.supplier.value = row.dataset.productSupplier || "";
      editProductForm.elements.price.value = row.dataset.productPrice || "";
      editProductForm.elements.stock.value = row.dataset.productStock || "";
      editProductForm.elements.image.value = "";
      productModal.hidden = false;
      document.body.style.overflow = "hidden";
      editProductForm.elements.name.focus();
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeProductModal();
  });

  const editSupplierId = new URLSearchParams(window.location.search).get("edit");
  if (editSupplierId && supplierForm) {
    const editButton = document.querySelector(`.supplier-card[data-supplier-id="${CSS.escape(editSupplierId)}"] .supplier-edit`);
    if (editButton) editButton.click();
  }
});