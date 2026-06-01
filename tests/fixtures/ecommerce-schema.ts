/**
 * E-commerce schema for order, payment, and affiliate network query tests.
 *
 * Uses the original database naming conventions:
 * - Table names: PascalCase with underscores (e.g., Network_Order)
 * - Column names: camelCase (e.g., orderId, networkId)
 *
 * The typed-sql library should handle quoted identifier normalization
 * to match these keys. Any failures indicate library limitations.
 */

export type EcommerceSchema = {
    defaultSchema: "public";
    schemas: {
        public: {
            // ----------------------------------------------------------------
            // Core order tables
            // ----------------------------------------------------------------
            Network_Order: {
                id: string;
                orderId: string;
                networkId: string;
                advertiser: string;
                clickId: string | null;
                status: string | null;
                orderDate: string;
                saleAmount: number;
                commissionAmount: number;
                currency: string;
                importedAt: string;
                details: string;
                grossSaleAmount: number;
                grossCommissionAmount: number;
                grossItemsCount: number;
                itemsCount: number;
                cancelledItemsCount: number;
                autoApprovedAt: string | null;
                pseCommissionRate: number;
                retailerCommissionRate: number | null;
                retailerCommissionRateClick: number | null;
                pseCommissionRateClick: number;
                manualStatus: string | null;
                raw: boolean | null;
                internalStatus: string | null;
                notes: string | null;
                psePaymentStatus: string | null;
                correctedGrossSaleAmount: number | null;
                correctedSaleAmount: number | null;
                correctedGrossCommissionAmount: number | null;
                correctedCommissionAmount: number | null;
                affiliatePaymentStatus: string | null;
                affiliatePaymentDate: string | null;
                manualAffiliatePaymentStatus: string | null;
                manualPsePaymentStatus: string | null;
                revolutPaymentStatus: string | null;
                pseBalance: number;
                affiliateRefundStatus: string | null;
                rawOrderId: string | null;
                manualRevolutPaymentStatus: string | null;
                manualAffiliateRefundStatus: string | null;
            };

            Network_Order_Snapshot: {
                id: string;
                networkId: string;
                clickId: string | null;
                orderId: string;
                importedAt: string;
                orderDate: string;
                status: string | null;
                details: string;
                rawOrderId: string | null;
            };

            // ----------------------------------------------------------------
            // CJ network item table
            // ----------------------------------------------------------------
            Network_Order_CJ_Item: {
                id: string;
                orderId: string;
                sku: string;
                itemValue: number;
                itemCommission: number;
                quantity: number;
                manualStatus: string | null;
                currency: string;
                notes: string | null;
                internalStatus: string | null;
                psePaymentStatus: string | null;
                affiliatePaymentStatus: string | null;
                affiliateRefundStatus: string | null;
                pseBalance: number;
                grossSaleAmount: number;
                saleAmount: number;
                grossCommissionAmount: number;
                commissionAmount: number;
                manualAffiliatePaymentStatus: string | null;
                manualPsePaymentStatus: string | null;
                manualAffiliateRefundStatus: string | null;
            };

            // ----------------------------------------------------------------
            // Partnerize network item table
            // ----------------------------------------------------------------
            Network_Order_Partnerize_Item: {
                id: string;
                orderId: string;
                sku: string;
                name: string;
                brand: string;
                quantity: number;
                status: string | null;
                lastUpdatedAt: string;
                itemValue: number;
                itemCommission: number;
                currency: string;
                conversionItemId: string;
                details: string;
                manualStatus: string | null;
                payable: boolean | null;
                selfBillId: string | null;
                notes: string | null;
                internalStatus: string | null;
                psePaymentStatus: string | null;
                affiliatePaymentStatus: string | null;
                affiliateRefundStatus: string | null;
                pseBalance: number;
                grossSaleAmount: number;
                saleAmount: number;
                grossCommissionAmount: number;
                commissionAmount: number;
                manualAffiliatePaymentStatus: string | null;
                manualPsePaymentStatus: string | null;
                manualAffiliateRefundStatus: string | null;
            };

            // ----------------------------------------------------------------
            // Rakuten network item table
            // ----------------------------------------------------------------
            Network_Order_Rakuten_Item: {
                id: string;
                orderId: string;
                processDate: string;
                quantity: number;
                sku: string;
                product: string;
                saleAmount: number;
                commissionAmount: number;
                currency: string;
                details: string;
                importedAt: string;
                grossItemsCount: number;
                itemsCount: number;
                cancelledItemsCount: number;
                manualStatus: string | null;
                notes: string | null;
                grossSaleAmount: number;
                grossCommissionAmount: number;
                internalStatus: string | null;
                psePaymentStatus: string | null;
                affiliatePaymentStatus: string | null;
                affiliateRefundStatus: string | null;
                pseBalance: number;
                rawOrderId: string | null;
                manualAffiliatePaymentStatus: string | null;
                manualPsePaymentStatus: string | null;
                manualAffiliateRefundStatus: string | null;
            };

            Network_Order_Rakuten_Item_Snapshot: {
                id: string;
                rakutenItemId: string | null;
                processDate: string;
                orderId: string;
                sku: string;
                importedAt: string;
                details: string;
                transactionId: string;
                saleAmount: number;
                commissionAmount: number;
                currency: string;
                quantity: number;
                rawOrderId: string | null;
            };

            // ----------------------------------------------------------------
            // PSE approved payments
            // ----------------------------------------------------------------
            User_ApprovedPayment: {
                id: string;
                userId: string;
                networkOrderId: string | null;
                type: number | null;
                amount: number;
                currency: string;
                comment: string | null;
                createdAt: string;
                paid: boolean;
                paymentMonth: string | null;
                revolutDraftId: string | null;
                revolutReference: string | null;
                vat: number;
                status: string;
            };

            User_ApprovedPayment_Item: {
                id: string;
                userApprovedPaymentId: string;
                rakutenItemId: string | null;
                cjItemId: string | null;
                partnerizeItemId: string | null;
                amount: number;
                vat: number;
                currency: string;
                anyItemId: string;
            };

            // ----------------------------------------------------------------
            // Revolut payment processing
            // ----------------------------------------------------------------
            Revolut_PaymentDraft: {
                id: string;
                userId: string | null;
                amount: number;
                currency: string;
                status: string;
                createdAt: string;
                revolutDraftId: string | null;
                reference: string;
                transactionId: string | null;
                metadata: string | null;
                vat: number;
            };

            Revolut_PaymentInvoice: {
                id: string;
                paymentId: string | null;
                createdAt: string;
                status: string;
                amount: number;
                vat: number;
                userId: string | null;
                data: string;
                s3Key: string | null;
                currency: string;
            };

            // ----------------------------------------------------------------
            // Click tracking
            // ----------------------------------------------------------------
            LogProductClick: {
                id: string;
                productId: string | null;
                createdAt: string;
                userId: string | null;
                sid: string | null;
                usedUrl: string | null;
                userAgent: string | null;
                isBot: boolean;
                campaignId: string | null;
                catalogueProductId: string | null;
                referenceUserId: string | null;
                linkId: string | null;
                userCountry: string | null;
                shopperId: string | null;
                moodboardId: string | null;
                teamId: string | null;
                targetDomain: string | null;
            };

            // ----------------------------------------------------------------
            // CJ payment tables
            // ----------------------------------------------------------------
            Network_Payment_CJ: {
                id: string;
                payment_date: string;
                advertiser_name: string;
                sale_amount: number;
                publisher_commission: number;
                details: string;
                groupId: string | null;
            };

            Network_Payment_CJ_Group: {
                id: string;
                datePaid: string;
            };

            Network_Payment_CJ_Order: {
                orderId: string;
                paymentId: string;
                paymentDate: string;
                manuallyAssigned: boolean;
            };

            // ----------------------------------------------------------------
            // Partnerize self-bill
            // ----------------------------------------------------------------
            Network_Partnerize_Selfbill: {
                id: string;
                creationDate: string;
                paymentDate: string | null;
                details: string;
                netValue: number;
                totalValue: number;
                status: string | null;
                currency: string | null;
            };

            // ----------------------------------------------------------------
            // Rakuten payment tables
            // ----------------------------------------------------------------
            Network_Payment_Invoice_Item_Rakuten: {
                id: string;
                date: string;
                time: string;
                advertiserId: number;
                advertiserName: string;
                orderId: string;
                sku: string;
                productName: string;
                items: number;
                sales: number;
                baselineCommission: number;
                adjustedCommission: number;
                actualCommission: number;
                reason: string | null;
                advertiserPaymentMemo: string | null;
                advertiserPaymentDate: string | null;
                invoiceId: string;
                matchingSku: string | null;
            };

            Network_Payment_Invoice_Rakuten: {
                id: string;
                paymentId: string;
                advertiserId: number;
                advertiserName: string;
                invoiceId: string;
                transactionCommissions: number;
                bonusAmount: number;
                cpmCpcCommissions: number;
                cancelledCommissions: number;
                previouslyHeldCommissions: number;
                paymentAmount: number;
                advertiserPaymentDate: string | null;
                invoiceDate: string | null;
                vat: number | null;
            };

            Network_Payment_Rakuten: {
                id: string;
                paymentId: string;
                date: string;
                paymentType: string | null;
                checkNumber: string | null;
                currency: string;
                totalCommissionAmount: number;
                paymentStatus: string;
            };

            Network_Rakuten_Invoice_Settlement: {
                id: string;
                naInvoiceId: string;
                settlingInvoiceId: string;
                advertiserId: number;
                currency: string;
                allocatedAmount: number;
                naInvoiceDate: string;
                settlingInvoiceDate: string;
                settlementDate: string;
                createdAt: string;
            };

            // ----------------------------------------------------------------
            // User tables
            // ----------------------------------------------------------------
            User: {
                id: string;
                email: string | null;
                phone: string | null;
                avatar: string | null;
                details: string | null;
                givenName: string | null;
                familyName: string | null;
                createdAt: string;
                updatedAt: string;
                groups: string | null;
                bio: string | null;
                lastLoggedIn: string | null;
                enabled: boolean;
                handle: string | null;
                vip: boolean;
                cognitoId: string | null;
                userTerms: number;
                frTerms: number;
                whatsapp: string | null;
                defaultShopper: boolean;
                invitationId: string | null;
                firstLoggedIn: string | null;
                instagram: string | null;
                linkedin: string | null;
                deactivatedAt: string | null;
                facebook: string | null;
                website: string | null;
                twitter: string | null;
                logo: string | null;
            };

            User_Password_Reset: {
                userId: string;
                tempPassword: string;
                updatedAt: string;
                email: string;
            };
        };
    };
};
